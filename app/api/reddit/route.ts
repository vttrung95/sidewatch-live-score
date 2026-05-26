import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const subreddit = searchParams.get('subreddit') ?? 'baseball'
  const limit = searchParams.get('limit') ?? '10'

  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`,
    {
      headers: {
        'User-Agent': 'Sidewatch/1.0 (sports widget)',
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
