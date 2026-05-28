'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTeamAbbr } from '@/lib/utils'

/* ─── Shared types ───────────────────────────────────────────────────── */

type GameStatus = 'Live' | 'Final' | 'Preview'

interface InningLine {
  num: number
  away: { runs?: number }
  home: { runs?: number }
}

/** Single normalized shape consumed by the render layer, regardless of which
 *  endpoints were used to build it. */
interface NormalizedGame {
  status: GameStatus
  detailedState: string
  awayName: string
  homeName: string
  awayR: number
  awayH: number
  awayE: number
  homeR: number
  homeH: number
  homeE: number
  innings: InningLine[]
  totalInnings: number
  currentInning: number
  currentInningOrdinal: string
  inningState: string
  outs: number
  venue: string
  // LIVE-only fields
  pitcher?: string
  batter?: string
  onFirst: boolean
  onSecond: boolean
  onThird: boolean
}

/* ─── API helpers ────────────────────────────────────────────────────── */

function mlbUrl(path: string) {
  return `/api/scores?url=${encodeURIComponent('https://statsapi.mlb.com' + path)}`
}

/** FINAL strategy: /linescore  +  /boxscore  (no /feed/live) */
async function fetchFinalData(gameId: number, venueFallback: string, detailedStateFallback = ''): Promise<NormalizedGame> {
  const [lsRes, boxRes] = await Promise.all([
    fetch(mlbUrl(`/api/v1/game/${gameId}/linescore`)),
    fetch(mlbUrl(`/api/v1/game/${gameId}/boxscore`)),
  ])
  if (!lsRes.ok) throw new Error(`linescore returned ${lsRes.status}`)
  if (!boxRes.ok) throw new Error(`boxscore returned ${boxRes.status}`)

  const [ls, box] = await Promise.all([lsRes.json(), boxRes.json()])

  // linescore.teams has the authoritative R/H/E totals
  const lsAway = ls.teams?.away ?? {}
  const lsHome = ls.teams?.home ?? {}
  // boxscore.teams has team names (and can double-check totals)
  const boxAway = box.teams?.away ?? {}
  const boxHome = box.teams?.home ?? {}

  const innings: InningLine[] = (ls.innings ?? []).map(
    (inn: { num: number; away?: { runs?: number }; home?: { runs?: number } }) => ({
      num: inn.num,
      away: { runs: inn.away?.runs },
      home: { runs: inn.home?.runs },
    })
  )

  return {
    status: 'Final',
    detailedState: detailedStateFallback,
    awayName: boxAway.team?.name ?? '',
    homeName: boxHome.team?.name ?? '',
    awayR: lsAway.runs ?? boxAway.teamStats?.batting?.runs ?? 0,
    awayH: lsAway.hits ?? boxAway.teamStats?.batting?.hits ?? 0,
    awayE: lsAway.errors ?? boxAway.teamStats?.fielding?.errors ?? 0,
    homeR: lsHome.runs ?? boxHome.teamStats?.batting?.runs ?? 0,
    homeH: lsHome.hits ?? boxHome.teamStats?.batting?.hits ?? 0,
    homeE: lsHome.errors ?? boxHome.teamStats?.fielding?.errors ?? 0,
    innings,
    totalInnings: Math.max(9, innings.length),
    currentInning: ls.currentInning ?? 9,
    currentInningOrdinal: ls.currentInningOrdinal ?? '9th',
    inningState: ls.inningState ?? 'End',
    outs: ls.outs ?? 0,
    venue: venueFallback,
    onFirst: false,
    onSecond: false,
    onThird: false,
  }
}

/** LIVE strategy: /feed/live  (throws on non-200 so caller can catch 404) */
async function fetchLiveData(gameId: number): Promise<NormalizedGame> {
  const res = await fetch(mlbUrl(`/api/v1/game/${gameId}/feed/live?hydrate=venue`))
  if (!res.ok) throw new Error(`feed/live returned ${res.status}`)

  const data = await res.json()
  const ls = data.liveData?.linescore ?? {}
  const gd = data.gameData ?? {}
  const lsTeams = ls.teams ?? {}

  const innings: InningLine[] = (ls.innings ?? []).map(
    (inn: { num: number; away?: { runs?: number }; home?: { runs?: number } }) => ({
      num: inn.num,
      away: { runs: inn.away?.runs },
      home: { runs: inn.home?.runs },
    })
  )

  return {
    status: (gd.status?.abstractGameState ?? 'Live') as GameStatus,
    detailedState: gd.status?.detailedState ?? '',
    awayName: gd.teams?.away?.name ?? '',
    homeName: gd.teams?.home?.name ?? '',
    awayR: lsTeams.away?.runs ?? 0,
    awayH: lsTeams.away?.hits ?? 0,
    awayE: lsTeams.away?.errors ?? 0,
    homeR: lsTeams.home?.runs ?? 0,
    homeH: lsTeams.home?.hits ?? 0,
    homeE: lsTeams.home?.errors ?? 0,
    innings,
    totalInnings: Math.max(9, innings.length, ls.currentInning ?? 0),
    currentInning: ls.currentInning ?? 0,
    currentInningOrdinal: ls.currentInningOrdinal ?? '',
    inningState: ls.inningState ?? '',
    outs: ls.outs ?? 0,
    venue: gd.venue?.name ?? '',
    pitcher: ls.defense?.pitcher?.fullName,
    batter: ls.offense?.batter?.fullName,
    onFirst: !!ls.offense?.first,
    onSecond: !!ls.offense?.second,
    onThird: !!ls.offense?.third,
  }
}

/* ─── Component ─────────────────────────────────────────────────────── */

export default function BoxScore({
  gameId,
  initialStatus,
  venueFallback = '',
  detailedStateFallback = '',
}: {
  gameId: number
  initialStatus: GameStatus
  venueFallback?: string
  detailedStateFallback?: string
}) {
  const [game, setGame] = useState<NormalizedGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Track effective status so polling can switch strategies mid-session
  // (e.g. a LIVE game finishes and /feed/live starts returning 404)
  const [currentStatus, setCurrentStatus] = useState<GameStatus>(initialStatus)
  const fetchData = useCallback(async () => {
    try {
      let normalized: NormalizedGame

      if (currentStatus === 'Final') {
        normalized = await fetchFinalData(gameId, venueFallback, detailedStateFallback)
      } else {
        // Live (or Preview) — try /feed/live first
        try {
          normalized = await fetchLiveData(gameId)
          // If the game just ended the API returns status=Final; switch strategy
          if (normalized.status === 'Final') {
            console.log(`[BoxScore] game ${gameId} transitioned to Final, switching strategy`)
            setCurrentStatus('Final')
          }
        } catch (liveErr) {
          const msg = liveErr instanceof Error ? liveErr.message : String(liveErr)
          if (msg.includes('404')) {
            // Always fall back to fetchFinalData to show something
            // But only flip currentStatus to Final when game is NOT Live
            // This way: box score shows data, header stays LIVE (correct)
            if (currentStatus !== 'Live') {
              setCurrentStatus('Final')
            }
            normalized = await fetchFinalData(gameId, venueFallback, detailedStateFallback)
          } else {
            throw liveErr
          }
        }
      }

      setGame(normalized)
      setError(null)
    } catch (err) {
      console.error('[BoxScore] fetch error:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [gameId, currentStatus, venueFallback, detailedStateFallback])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  /* ─── Render ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={s.center}>
        <span style={s.muted}>Loading box score…</span>
      </div>
    )
  }
  if (error || !game) {
    return (
      <div style={s.center}>
        <span style={s.muted}>{error ?? 'No data'}</span>
      </div>
    )
  }

  const isLive = game.status === 'Live'
  const isFinal = game.status === 'Final'
  const isDelayed = /delay|suspend/i.test(game.detailedState) || game.detailedState.toLowerCase() === 'postponed'

  // Cap at 9 visible innings — extra-inning games show the last 9 so the
  // table always fits in the 260 px PiP window without horizontal scroll.
  const MAX_INNINGS = 9
  const inningNums = Array.from({ length: game.totalInnings }, (_, i) => i + 1)
  const visibleInningNums = inningNums.length > MAX_INNINGS ? inningNums.slice(-MAX_INNINGS) : inningNums
  const inningByNum: Record<number, InningLine> = {}
  game.innings.forEach((inn) => { inningByNum[inn.num] = inn })

  // Extract before closure so TypeScript can narrow the non-null game ref.
  const currentInning = game.currentInning
  const inningStateLow = game.inningState.toLowerCase()

  function inningCell(num: number, side: 'away' | 'home'): string {
    const runs = inningByNum[num]?.[side]?.runs

    // ── FINAL: show every cell; blank means the home team didn't need to bat
    if (isFinal) return runs != null ? String(runs) : ''

    // ── PREVIEW / not started yet
    if (currentInning === 0) return '–'

    // ── Past inning: fully completed, always has data
    if (num < currentInning) return runs != null ? String(runs) : '0'

    // ── Current inning
    if (num === currentInning) {
      if (side === 'away') {
        // Away always bats first — they have (or are getting) their runs right now
        return runs != null ? String(runs) : '0'
      }
      // Home side: only show if the home half has started (Bottom) or finished (End)
      if (inningStateLow === 'bottom' || inningStateLow === 'end') {
        return runs != null ? String(runs) : '0'
      }
      return '–'  // still in Top or Middle — home hasn't batted
    }

    // ── Future inning: not played yet
    return '–'
  }

  return (
    <div style={s.wrap}>
      {/* Status row */}
      <div style={s.statusRow}>
        {isDelayed && <span style={s.delayedBadge}>DELAYED</span>}
        {isLive && !isDelayed && (
          <span style={s.liveBadge}>
            <span style={s.dot} />
            LIVE
          </span>
        )}
        {isFinal && !isDelayed && <span style={s.finalBadge}>FINAL</span>}
        {game.venue && <span style={s.venue}>{game.venue}</span>}
      </div>

      {/* Situation bar (LIVE only) */}
      {isLive && (
        <div style={s.situation}>
          <span>{game.inningState} {game.currentInningOrdinal}</span>
          <span>{game.outs} {game.outs === 1 ? 'Out' : 'Outs'}</span>
        </div>
      )}

      {/* Runner diamond (LIVE only) */}
      {isLive && (
        <div style={s.diamond}>
          <div style={{ ...s.base, ...s.second, background: game.onSecond ? '#1A56DB' : '#374151' }} />
          <div style={{ ...s.base, ...s.third,  background: game.onThird  ? '#1A56DB' : '#374151' }} />
          <div style={{ ...s.base, ...s.first,  background: game.onFirst  ? '#1A56DB' : '#374151' }} />
          <div style={{ ...s.base, ...s.home,   background: '#374151' }} />
        </div>
      )}

      {/* Pitcher / Batter (LIVE only) */}
      {isLive && (game.pitcher || game.batter) && (
        <div style={s.matchup}>
          {game.pitcher && <span>P: {game.pitcher}</span>}
          {game.batter  && <span>AB: {game.batter}</span>}
        </div>
      )}

      {/* Inning grid */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.thTeam} />
              {visibleInningNums.map((n) => <th key={n} style={s.thInn}>{n}</th>)}
              <th style={s.thRHE}>R</th>
              <th style={s.thRHE}>H</th>
              <th style={s.thRHE}>E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...s.tdTeam, color: game.awayR > game.homeR ? 'var(--score-winning)' : 'var(--score-normal)' }}>
                {getTeamAbbr(game.awayName)}
              </td>
              {visibleInningNums.map((n) => <td key={n} style={s.tdInn}>{inningCell(n, 'away')}</td>)}
              <td style={{ ...s.tdRHE, fontWeight: 700 }}>{game.awayR}</td>
              <td style={s.tdRHE}>{game.awayH}</td>
              <td style={s.tdRHE}>{game.awayE}</td>
            </tr>
            <tr>
              <td style={{ ...s.tdTeam, color: game.homeR > game.awayR ? 'var(--score-winning)' : 'var(--score-normal)' }}>
                {getTeamAbbr(game.homeName)}
              </td>
              {visibleInningNums.map((n) => <td key={n} style={s.tdInn}>{inningCell(n, 'home')}</td>)}
              <td style={{ ...s.tdRHE, fontWeight: 700 }}>{game.homeR}</td>
              <td style={s.tdRHE}>{game.homeH}</td>
              <td style={s.tdRHE}>{game.homeE}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const s: Record<string, React.CSSProperties> = {
  wrap: {
    background: 'var(--bg-widget)',
    color: 'var(--text-primary)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    width: '100%',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
    background: 'var(--bg-widget)',
  },
  muted: { color: 'var(--text-muted)', fontSize: '12px' },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    background: '#1a1f2e',
    borderBottom: '1px solid var(--border-primary)',
  },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: '#dc2626',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.3)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    padding: '1px 5px',
    borderRadius: '3px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#fff',
    display: 'inline-block',
  },
  finalBadge: {
    background: '#374151',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.3)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  venue: { color: 'var(--text-secondary)', fontSize: '11px', marginLeft: 'auto' },
  situation: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 8px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-surface-2)',
  },
  diamond: {
    position: 'relative',
    width: '48px',
    height: '48px',
    margin: '4px auto',
  },
  base: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    transform: 'rotate(45deg)',
    borderRadius: '2px',
  },
  second: { top: '2px',  left: '18px' },
  third:  { top: '18px', left: '2px'  },
  first:  { top: '18px', left: '34px' },
  home:   { bottom: '2px', left: '18px' },
  matchup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px 8px',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-surface-2)',
    borderTop: '1px solid var(--border-primary)',
  },
  tableWrap: { overflowX: 'hidden', padding: '4px 0' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'monospace',
    fontSize: '10px',
    tableLayout: 'fixed',
  },
  thTeam: { textAlign: 'left',   padding: '2px 4px', color: 'var(--text-muted)', fontWeight: 600, width: '28px' },
  thInn:  { textAlign: 'center', padding: '2px 1px', color: 'var(--text-muted)', fontWeight: 600 },
  thRHE:  { textAlign: 'center', padding: '2px 2px', color: 'var(--text-muted)', fontWeight: 700, borderLeft: '1px solid var(--border-primary)', width: '20px' },
  tdTeam: { textAlign: 'left',   padding: '3px 4px', fontWeight: 700, fontSize: '10px', overflow: 'hidden' },
  tdInn:  { textAlign: 'center', padding: '3px 1px', color: 'var(--text-primary)' },
  tdRHE:  { textAlign: 'center', padding: '3px 2px', color: 'var(--text-primary)', borderLeft: '1px solid var(--border-primary)' },
  delayedBadge: {
    background: '#d97706',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.3)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    padding: '1px 5px',
    borderRadius: '3px',
  },
}
