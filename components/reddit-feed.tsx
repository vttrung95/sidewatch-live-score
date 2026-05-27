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
  const res = await fetch(`https://old.reddit.com/r/${sub}/new.json?limit=50`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Reddit ${sub} ${res.status}`)
  const json = await res.json()
  return (json.data?.children ?? []).map((c: { data: RedditPost }) => c.data)
}

function sortTier(p: RedditPost): number {
  if (isGameKeyword(p.title)) return 0
  if (p.is_video || p.post_hint === 'image') return 1
  return 2
}

function filterAndSort(
  posts: RedditPost[],
  teamPostIds: Set<string>,
  awayTeam: string,
  homeTeam: string,
  isLive: boolean,
): RedditPost[] {
  const scoreMin = isLive ? 1 : 10
  return posts
    .filter((p) => {
      if (excludePost(p.title) || p.score < scoreMin) return false
      // Team-subreddit posts are always on-topic
      if (teamPostIds.has(p.id)) return true
      // r/baseball posts: must mention one of the two teams playing
      if (teamMentioned(p.title, awayTeam, homeTeam)) return true
      return false
    })
    .sort((a, b) => sortTier(a) - sortTier(b) || b.score - a.score)
}

export default function RedditFeed({
  awayTeam,
  homeTeam,
  isLive,
  gamePk,
  gameDate,
}: {
  awayTeam: string
  homeTeam: string
  isLive: boolean
  gamePk: number
  gameDate: string
}) {
  const [posts, setPosts] = useState<RedditPost[]>([])
  const [visibleCount, setVisibleCount] = useState(5)
  const [label, setLabel] = useState<FeedLabel>('LOADING FEED...')
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  const homeSub = getTeamSubreddit(homeTeam)
  const awaySub = getTeamSubreddit(awayTeam)

  // Per-game cache keyed by gamePk + date so same-team doubleheaders never collide.
  const cacheKey = `sidewatch_reddit_${gamePk}_${gameDate}`

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
    console.log(`[Reddit] Fetching for: ${awayTeam} @ ${homeTeam} | gamePk: ${gamePk} | date: ${gameDate}`)
    retryCountRef.current = 0

    const attempt = async () => {
      try {
        const [baseballResult, homeResult, awayResult] = await Promise.allSettled([
          fetchSubreddit('baseball'),
          homeSub !== 'baseball' ? fetchSubreddit(homeSub) : Promise.resolve<RedditPost[]>([]),
          awaySub !== 'baseball' && awaySub !== homeSub
            ? fetchSubreddit(awaySub)
            : Promise.resolve<RedditPost[]>([]),
        ])

        const baseballPosts = baseballResult.status === 'fulfilled' ? baseballResult.value : []
        const homeSubPosts  = homeResult.status   === 'fulfilled' ? homeResult.value   : []
        const awaySubPosts  = awayResult.status   === 'fulfilled' ? awayResult.value   : []

        // Track which post IDs came from either team subreddit so the filter
        // can keep them unconditionally (they're always on-topic).
        const teamPostIds = new Set([
          ...homeSubPosts.map((p) => p.id),
          ...awaySubPosts.map((p) => p.id),
        ])

        // Merge: team subreddits first so they win deduplication
        const seen = new Set<string>()
        const merged: RedditPost[] = []
        for (const p of [...homeSubPosts, ...awaySubPosts, ...baseballPosts]) {
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
        }

        const filtered = filterAndSort(merged, teamPostIds, awayTeam, homeTeam, isLive)

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
  }, [homeSub, awaySub, cacheKey, awayTeam, homeTeam, isLive, loadCache])

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
        <div style={s.empty}>
          <span style={s.emptyText}>Reddit feed unavailable</span>
          <a
            href="https://reddit.com/r/baseball"
            target="_blank"
            rel="noopener noreferrer"
            style={s.emptyLink}
          >
            View r/baseball on Reddit ↗
          </a>
        </div>
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
    background: 'var(--bg-widget)',
    color: 'var(--text-primary)',
    fontFamily: 'system-ui, sans-serif',
    width: '100%',
    borderTop: '1px solid var(--border-primary)',
  },
  header: {
    padding: '6px 8px',
    background: 'var(--bg-surface-2)',
    borderBottom: '1px solid var(--border-primary)',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#60a5fa',
  },
  empty: {
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  emptyText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  emptyLink: {
    fontSize: '11px',
    color: '#60a5fa',
    textDecoration: 'none',
    display: 'inline-block',
  },
  postLink: {
    display: 'flex',
    gap: '8px',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-primary)',
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
    background: 'var(--bg-surface-2)',
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
    color: 'var(--text-primary)',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  postMeta: { fontSize: '10px', color: 'var(--text-muted)' },
  loadMore: {
    width: '100%',
    padding: '8px',
    background: 'none',
    border: 'none',
    borderTop: '1px solid var(--border-primary)',
    color: '#60a5fa',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center',
  },
}
