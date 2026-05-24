'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getTeamSubreddit, shouldExcludePost } from '@/lib/utils'

interface RedditPost {
  id: string
  title: string
  permalink: string
  score: number
  thumbnail: string | null
  is_video: boolean
  post_hint?: string
  preview?: {
    images?: Array<{
      source?: { url: string }
    }>
  }
  author: string
  num_comments: number
}

type FeedLabel =
  | 'LOADING FEED...'
  | 'R/BASEBALL · GAME THREAD'
  | 'R/BASEBALL · NEW POSTS'
  | 'R/BASEBALL · CACHED'

const EXCLUDE_KEYWORDS = [
  'dead', 'dies', 'passing', 'optioned', 'minors',
  'aaa', 'trade', 'sign', 'contract', 'injury', 'dl', 'il',
  'suspended', 'fined', 'arrested', 'dfa',
]

// Unambiguously baseball-specific terms — a post containing these is always
// relevant even if it doesn't name either team explicitly.
const GAME_KEYWORDS = [
  'home run', 'homer', 'strikeout', 'walk-off', 'walkoff',
  'no-hitter', 'no hitter', 'perfect game', 'grand slam',
  'shutout', 'stolen base', 'game thread', 'post game',
]

function excludePost(title: string) {
  const low = title.toLowerCase()
  return EXCLUDE_KEYWORDS.some((kw) => low.includes(kw))
}

/**
 * Returns true when `title` mentions either team by nickname.
 * Checks the last word (e.g. "Cardinals") and last two words
 * (e.g. "Red Sox", "White Sox") so hyphenated or two-word nicknames work.
 */
function teamMentioned(title: string, awayTeam: string, homeTeam: string): boolean {
  const low = title.toLowerCase()
  for (const teamName of [awayTeam, homeTeam]) {
    const words = teamName.toLowerCase().split(' ')
    const nickname = words[words.length - 1]           // e.g. "Cardinals"
    if (nickname.length >= 4 && low.includes(nickname)) return true
    if (words.length >= 2) {
      const twoWord = words.slice(-2).join(' ')          // e.g. "Red Sox"
      if (low.includes(twoWord)) return true
    }
  }
  return false
}

function isGameKeyword(title: string): boolean {
  const low = title.toLowerCase()
  return GAME_KEYWORDS.some((kw) => low.includes(kw))
}

function getThumbnail(post: RedditPost): string | null {
  const preview = post.preview?.images?.[0]?.source?.url
  if (preview) return preview.replace(/&amp;/g, '&')
  if (post.thumbnail && post.thumbnail.startsWith('http')) return post.thumbnail
  return null
}

async function fetchSubreddit(sub: string): Promise<RedditPost[]> {
  const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=50`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Reddit ${sub} ${res.status}`)
  const json = await res.json()
  return (json.data?.children ?? []).map((c: { data: RedditPost }) => c.data)
}

function filterAndSort(
  posts: RedditPost[],
  teamPostIds: Set<string>,
  awayTeam: string,
  homeTeam: string,
): RedditPost[] {
  return posts
    .filter((p) => {
      if (excludePost(p.title) || p.score < 10) return false
      // Team-subreddit posts are always on-topic
      if (teamPostIds.has(p.id)) return true
      // r/baseball posts: keep only those relevant to this matchup
      if (teamMentioned(p.title, awayTeam, homeTeam)) return true
      if (isGameKeyword(p.title)) return true
      return false
    })
    .sort((a, b) => {
      const aHigh = a.is_video || a.post_hint === 'image' ? 1 : 0
      const bHigh = b.is_video || b.post_hint === 'image' ? 1 : 0
      return bHigh - aHigh || b.score - a.score
    })
}

export default function RedditFeed({
  awayTeam,
  homeTeam,
}: {
  awayTeam: string
  homeTeam: string
}) {
  const [posts, setPosts] = useState<RedditPost[]>([])
  const [visibleCount, setVisibleCount] = useState(5)
  const [label, setLabel] = useState<FeedLabel>('LOADING FEED...')
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  // Home team drives the subreddit (they get the "home crowd" feed);
  // fall back to away team if home team doesn't have a mapping.
  const teamSub = getTeamSubreddit(homeTeam) !== 'baseball'
    ? getTeamSubreddit(homeTeam)
    : getTeamSubreddit(awayTeam)

  // Per-game cache so different matchups don't bleed into each other.
  const cacheKey = `sidewatch_reddit_${awayTeam.replace(/\s+/g, '_')}_vs_${homeTeam.replace(/\s+/g, '_')}`

  const loadCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(cacheKey)
      if (!raw) return false
      const { posts, timestamp } = JSON.parse(raw)
      if (!posts || Date.now() - timestamp > 10 * 60 * 1000) return false
      if (posts.length > 0) {
        setPosts(posts)
        setLabel('R/BASEBALL · CACHED')
        return true
      }
    } catch {}
    return false
  }, [cacheKey])

  const fetchPosts = useCallback(async () => {
    setLabel('LOADING FEED...')
    retryCountRef.current = 0

    const attempt = async () => {
      try {
        const [baseballResult, teamResult] = await Promise.allSettled([
          fetchSubreddit('baseball'),
          teamSub !== 'baseball' ? fetchSubreddit(teamSub) : Promise.resolve<RedditPost[]>([]),
        ])

        const baseballPosts = baseballResult.status === 'fulfilled' ? baseballResult.value : []
        const teamSubPosts  = teamResult.status  === 'fulfilled' ? teamResult.value  : []

        // Track which post IDs came from the team subreddit so the filter
        // can keep them unconditionally (they're always on-topic).
        const teamPostIds = new Set(teamSubPosts.map((p) => p.id))

        // Merge: team subreddit first so it wins deduplication
        const seen = new Set<string>()
        const merged: RedditPost[] = []
        for (const p of [...teamSubPosts, ...baseballPosts]) {
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
        }

        const filtered = filterAndSort(merged, teamPostIds, awayTeam, homeTeam)

        const hasGameThread = merged.some((p) =>
          p.title.toLowerCase().includes('game thread')
        )

        setPosts(filtered)
        setLabel(hasGameThread ? 'R/BASEBALL · GAME THREAD' : 'R/BASEBALL · NEW POSTS')

        try { localStorage.setItem(cacheKey, JSON.stringify({ posts: filtered, timestamp: Date.now() })) } catch {}
      } catch {
        const delays = [5_000, 15_000, 30_000]
        const delay = delays[Math.min(retryCountRef.current, delays.length - 1)]
        retryCountRef.current += 1
        const hasCached = loadCache()
        if (!hasCached) setLabel('LOADING FEED...')
        retryRef.current = setTimeout(attempt, delay)
      }
    }

    attempt()
  }, [teamSub, cacheKey, awayTeam, homeTeam, loadCache])

  useEffect(() => {
    setVisibleCount(5)   // reset pagination whenever game/fetch changes
    fetchPosts()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [fetchPosts])

  const visible = posts.slice(0, visibleCount)

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.label}>{label}</span>
      </div>

      {visible.length === 0 && label !== 'LOADING FEED...' && (
        <div style={s.empty}>No posts found</div>
      )}

      {visible.map((post) => {
        const thumb = getThumbnail(post)
        return (
          <a
            key={post.id}
            href={`https://www.reddit.com${post.permalink}`}
            target="_blank"
            rel="noopener noreferrer"
            style={s.postLink}
          >
            {thumb && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={thumb}
                alt=""
                style={s.thumb}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
            <div style={s.postBody}>
              <span style={s.postTitle}>{post.title}</span>
              <span style={s.postMeta}>
                ↑ {post.score.toLocaleString()} · {post.num_comments} comments
              </span>
            </div>
          </a>
        )
      })}

      {posts.length > visibleCount && (
        <button
          onClick={() => setVisibleCount((c) => c + 5)}
          style={s.loadMore}
        >
          Load 5 more
        </button>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    background: '#1E2A3A',
    color: '#e2e8f0',
    fontFamily: 'system-ui, sans-serif',
    width: '100%',
    borderTop: '1px solid #2d3f52',
  },
  header: {
    padding: '6px 8px',
    background: '#162132',
    borderBottom: '1px solid #2d3f52',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#60a5fa',
  },
  empty: { padding: '12px 8px', fontSize: '11px', color: '#6b7280' },
  postLink: {
    display: 'flex',
    gap: '8px',
    padding: '6px 8px',
    borderBottom: '1px solid #2d3f52',
    textDecoration: 'none',
    color: 'inherit',
    alignItems: 'flex-start',
    transition: 'background 0.1s',
  },
  thumb: {
    width: '40px',
    height: '40px',
    objectFit: 'cover',
    borderRadius: '4px',
    flexShrink: 0,
    background: '#2d3f52',
  },
  postBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  postTitle: {
    fontSize: '11px',
    lineHeight: 1.4,
    color: '#e2e8f0',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  postMeta: { fontSize: '10px', color: '#6b7280' },
  loadMore: {
    width: '100%',
    padding: '8px',
    background: 'none',
    border: 'none',
    borderTop: '1px solid #2d3f52',
    color: '#60a5fa',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center',
  },
}
