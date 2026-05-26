import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const subreddit = searchParams.get('subreddit') ?? 'baseball'
  const limit = searchParams.get('limit') ?? '10'

  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.rss?limit=${limit}`,
    {
      headers: {
        'User-Agent': 'Sidewatch/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      next: { revalidate: 60 },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Reddit fetch failed' }, { status: res.status })
  }

  const xml = await res.text()

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
  const children = entries.map(([, entry]) => {
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''
    const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? ''
    const score = parseInt(entry.match(/score: (\d+)/)?.[1] ?? '0')
    const comments = parseInt(entry.match(/comments: (\d+)/)?.[1] ?? '0')

    return {
      data: {
        title,
        url: link,
        permalink: link,
        score,
        num_comments: comments,
        thumbnail: '',
      }
    }
  })

  return NextResponse.json({ data: { children } })
}
