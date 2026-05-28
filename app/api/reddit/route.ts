import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const sub = request.nextUrl.searchParams.get('sub')

  if (!sub) {
    return Response.json({ posts: [], error: 'Missing sub parameter' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=50`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'web:sidewatch:1.0 (by /u/vttrung95)',
      },
    })

    if (!res.ok) {
      return Response.json({ posts: [], error: String(res.status) }, {
        headers: { 'Cache-Control': 'public, s-maxage=120' },
      })
    }

    const json = await res.json()
    const posts = json.data?.children ?? []

    return Response.json({ posts }, {
      headers: { 'Cache-Control': 'public, s-maxage=120' },
    })
  } catch {
    return Response.json({ posts: [], error: 'fetch_failed' }, {
      headers: { 'Cache-Control': 'public, s-maxage=120' },
    })
  }
}
