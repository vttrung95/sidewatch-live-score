import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  if (!url.startsWith('https://statsapi.mlb.com/')) {
    return Response.json({ error: 'URL not allowed' }, { status: 403 })
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return Response.json(
        { error: `MLB API returned ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return Response.json({ error: 'Failed to fetch from MLB API' }, { status: 500 })
  }
}
