import type { NextRequest } from 'next/server'

export const runtime = 'edge'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Returns { monthName: "May", day: 29, numeric: "5/29", numericPadded: "05/29" }
// for a "YYYY-MM-DD" string.
function parseDatePatterns(dateStr: string) {
  const [, mm, dd] = dateStr.split('-')
  const monthIndex = parseInt(mm, 10) - 1
  const day = parseInt(dd, 10)
  const monthName = MONTH_NAMES[monthIndex]
  return {
    monthName,
    day,
    numeric: `${parseInt(mm, 10)}/${day}`,
    numericPadded: `${mm}/${dd}`,
  }
}

const MONTH_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\b/

// Returns the { month (1-12), day } extracted from a title, or null if none found.
function extractTitleDate(title: string): { month: number; day: number } | null {
  const mMonth = MONTH_RE.exec(title)
  if (mMonth) {
    const monthIndex = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === mMonth[1].toLowerCase().slice(0, 3)
    )
    if (monthIndex !== -1) return { month: monthIndex + 1, day: parseInt(mMonth[2], 10) }
  }
  const mNumeric = NUMERIC_DATE_RE.exec(title)
  if (mNumeric) {
    return { month: parseInt(mNumeric[1], 10), day: parseInt(mNumeric[2], 10) }
  }
  return null
}

export async function GET(request: NextRequest) {
  const sub = request.nextUrl.searchParams.get('sub')
  const gameDate = request.nextUrl.searchParams.get('gameDate') // "YYYY-MM-DD" or null

  if (!sub) {
    return Response.json({ posts: [], error: 'Missing sub parameter' }, { status: 400 })
  }

  // Parse target month+day once (null if no gameDate provided)
  const target = gameDate ? parseDatePatterns(gameDate) : null

  try {
    const res = await fetch(
      `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${sub}&limit=50&sort=desc`,
      { headers: { 'User-Agent': 'sidewatch/1.0' } }
    )

    if (!res.ok) {
      console.error(`[reddit] Arctic Shift error: ${res.status} for r/${sub}`)
      return Response.json({ posts: [], error: 'unavailable' }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPosts = (json.posts ?? json.data ?? []).map((post: any) => ({
      id: post.id,
      title: post.title,
      score: post.score,
      url: post.url_overridden_by_dest ?? post.url,
      permalink: post.permalink,
      num_comments: post.num_comments,
      thumbnail: post.thumbnail ?? null,
      preview: post.preview ?? null,
      created_utc: post.created_utc,
      author: post.author,
      is_video: post.is_video ?? false,
      post_hint: post.post_hint,
    }))

    let posts = allPosts
    if (target) {
      const targetMonth = MONTH_NAMES.indexOf(target.monthName) + 1
      const targetDay = target.day
      const before = allPosts.length
      posts = allPosts.filter((p: { title: string }) => {
        const found = extractTitleDate(p.title)
        if (!found) return true
        return found.month === targetMonth && found.day === targetDay
      })
      console.log(`[Reddit Filter] gameDate=${gameDate} dropped=${before - posts.length} kept=${posts.length}`)
    }

    if (posts.length === 0) {
      console.warn(`[reddit] Empty posts array for r/${sub}`)
      return Response.json({ posts: [] }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return Response.json({ posts }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=10' },
    })
  } catch (err) {
    console.error(`[reddit] fetch() threw for r/${sub}:`, err)
    return Response.json({ posts: [], error: 'unavailable' }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
