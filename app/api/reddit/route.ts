import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const subreddit = searchParams.get('subreddit') ?? 'baseball'
  const limit = searchParams.get('limit') ?? '10'

  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 60 },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Reddit fetch failed' }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
