import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const sub = request.nextUrl.searchParams.get('sub')

  if (!sub) {
    return Response.json({ posts: [], error: 'Missing sub parameter' }, { status: 400 })
  }

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
    const posts = (json.posts ?? json.data ?? []).map((post: any) => ({
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
