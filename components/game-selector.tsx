'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as ReactDOM from 'react-dom/client'
import BoxScore from './box-score'
import RedditFeed from './reddit-feed'
import { getTodayDate, getYesterdayDate, formatGameTime, getTeamAbbr } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────────────────── */

type GameState = 'Live' | 'Final' | 'Preview'

interface MlbGame {
  gamePk: number
  gameDate: string
  doubleHeader: string   // 'N' = none | 'Y' = twinbill | 'S' = split admission
  gameNumber: number     // 1 or 2 for doubleheaders
  status: {
    abstractGameState: GameState
    detailedState: string
  }
  teams: {
    away: { score?: number; team: { id: number; name: string } }
    home: { score?: number; team: { id: number; name: string } }
  }
  linescore?: {
    currentInning?: number
    currentInningOrdinal?: string
    inningState?: string
  }
  venue?: { name: string }
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
      window: Window | null
    }
  }
}

/* ─── Widget (renders inside PiP window) ────────────────────────────── */

function WidgetWrapper({
  game: initialGame,
  pipWindow,
}: {
  game: MlbGame
  pipWindow: Window
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('widget_collapsed') === 'true'
  )
  const [score, setScore] = useState({
    away: initialGame.teams.away.score,
    home: initialGame.teams.home.score,
  })
  const [gameState, setGameState] = useState(initialGame.status.abstractGameState)
  const [gameDetailedState, setGameDetailedState] = useState(initialGame.status.detailedState)
  const [inningLabel, setInningLabel] = useState(() => {
    const ls = initialGame.linescore
    return ls?.inningState && ls?.currentInningOrdinal
      ? `${ls.inningState} ${ls.currentInningOrdinal}`
      : ''
  })

  // Poll score every 30s regardless of collapsed state
  useEffect(() => {
    const poll = async () => {
      try {
        const url = encodeURIComponent(
          `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${initialGame.gamePk}`
        )
        const res = await fetch(`/api/scores?url=${url}`)
        if (!res.ok) return
        const data = await res.json()
        const g: MlbGame = data.dates?.[0]?.games?.[0]
        if (!g) return
        setScore({ away: g.teams.away.score, home: g.teams.home.score })
        setGameState(g.status.abstractGameState)
        setGameDetailedState(g.status.detailedState)
        if (g.linescore?.inningState && g.linescore?.currentInningOrdinal) {
          setInningLabel(`${g.linescore.inningState} ${g.linescore.currentInningOrdinal}`)
        }
      } catch {}
    }
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [initialGame.gamePk])

  // FIX 6: collapsed width 320px, height 72px
  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('widget_collapsed', String(next))
    try {
      pipWindow.resizeTo(next ? 320 : 260, next ? 72 : 420)
    } catch {}
  }, [collapsed, pipWindow])

  const awayAbbr = getTeamAbbr(initialGame.teams.away.team.name)
  const homeAbbr = getTeamAbbr(initialGame.teams.home.team.name)
  const isLive = gameState === 'Live'
  const isFinal = gameState === 'Final'
  const isDelayed = /delay|suspend/i.test(gameDetailedState) || gameDetailedState.toLowerCase() === 'postponed'

  return (
    <div
      style={{
        width: '100%',
        height: collapsed ? '72px' : '420px',   // FIX 6
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 200ms ease-in-out',
        background: 'var(--bg-widget)',          // CSS var
        color: 'var(--text-primary)',            // CSS var
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header bar — keep brand blue, no variable */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: collapsed ? '72px' : '36px',  // FIX 6
          background: '#1A56DB',
          flexShrink: 0,
        }}
      >
        {/* FIX 6: score row — nowrap + flexShrink on every child */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflow: 'hidden',
          width: '100%',
          whiteSpace: 'nowrap',
        }}>
          {isLive && !isDelayed && (
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#ff4444',
                display: 'inline-block',
                boxShadow: '0 0 4px #ff4444',
                flexShrink: 0,
              }}
            />
          )}
          <span style={{
            fontWeight: 700,
            fontSize: collapsed ? '14px' : '13px',
            color: '#fff',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {awayAbbr} {score.away ?? '–'} — {homeAbbr} {score.home ?? '–'}
          </span>
          {inningLabel && isLive && !isDelayed && (
            <span style={{ fontSize: '10px', color: '#bfdbfe', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {inningLabel}
            </span>
          )}
          {isDelayed && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                background: '#B45309',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
            >
              DELAYED
            </span>
          )}
          {isLive && !isDelayed && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                background: '#A32D2D',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
            >
              LIVE
            </span>
          )}
          {isFinal && !isDelayed && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                background: '#4b5563',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
            >
              FINAL
            </span>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '4px',
            opacity: 0.9,
            flexShrink: 0,
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '⊞' : '⊟'}
        </button>
      </div>

      {/* Scrollable body — flex:1 + minHeight:0 so only this div scrolls */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <BoxScore
            gameId={initialGame.gamePk}
            initialStatus={initialGame.status.abstractGameState}
            venueFallback={initialGame.venue?.name ?? ''}
            detailedStateFallback={gameDetailedState}
          />
          <RedditFeed
            awayTeam={initialGame.teams.away.team.name}
            homeTeam={initialGame.teams.home.team.name}
          />
        </div>
      )}
    </div>
  )
}

/* ─── PiP helpers ───────────────────────────────────────────────────── */

function copyStylesToWindow(target: Window) {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
    const link = target.document.createElement('link')
    link.rel = 'stylesheet'
    link.href = (el as HTMLLinkElement).href
    target.document.head.appendChild(link)
  })
  document.querySelectorAll('style').forEach((el) => {
    const style = target.document.createElement('style')
    style.textContent = el.textContent
    target.document.head.appendChild(style)
  })
}

async function checkLock(): Promise<boolean> {
  const raw = localStorage.getItem('sidewatch_active')
  if (!raw) return true // no lock, clear to proceed

  try {
    const lock: { ts: number } = JSON.parse(raw)
    if (Date.now() - lock.ts >= 5 * 60 * 1000) {
      localStorage.removeItem('sidewatch_active')
      return true // stale lock
    }
    // Ping active widget
    const bc = new BroadcastChannel('sidewatch')
    const pong = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        bc.close()
        resolve(false)
      }, 500)
      bc.onmessage = (e) => {
        if (e.data === 'pong') {
          clearTimeout(timer)
          bc.close()
          resolve(true)
        }
      }
      bc.postMessage('ping')
    })
    if (pong) return false // active widget exists
    localStorage.removeItem('sidewatch_active')
    return true
  } catch {
    localStorage.removeItem('sidewatch_active')
    return true
  }
}

async function launchPiPWidget(game: MlbGame) {
  if (!window.documentPictureInPicture) {
    alert('Document Picture-in-Picture is not supported in this browser.')
    return
  }

  const canProceed = await checkLock()
  if (!canProceed) {
    alert('A Sidewatch widget is already open.')
    return
  }

  localStorage.setItem('sidewatch_active', JSON.stringify({ ts: Date.now() }))

  const initialCollapsed = localStorage.getItem('widget_collapsed') === 'true'
  // FIX 6: collapsed initial size 320×72
  const pipWindow = await window.documentPictureInPicture.requestWindow({
    width:  initialCollapsed ? 320 : 260,
    height: initialCollapsed ? 72  : 420,
  })

  copyStylesToWindow(pipWindow)

  // Propagate current theme class to PiP window
  if (document.documentElement.classList.contains('light')) {
    pipWindow.document.documentElement.classList.add('light')
  }

  pipWindow.document.documentElement.style.cssText = 'height:100%;overflow:hidden'
  pipWindow.document.body.style.cssText = 'margin:0;padding:0;background:var(--bg-widget);height:100%;overflow:hidden'

  const container = pipWindow.document.createElement('div')
  container.id = 'sidewatch-root'
  pipWindow.document.body.appendChild(container)

  // Respond to pings
  const bc = new BroadcastChannel('sidewatch')
  bc.onmessage = (e) => {
    if (e.data === 'ping') bc.postMessage('pong')
  }

  // Heartbeat
  const heartbeat = setInterval(() => {
    localStorage.setItem('sidewatch_active', JSON.stringify({ ts: Date.now() }))
  }, 60_000)

  let root: ReturnType<typeof ReactDOM.createRoot> | null = null

  const cleanup = () => {
    localStorage.removeItem('sidewatch_active')
    bc.close()
    clearInterval(heartbeat)
    root?.unmount()
  }

  pipWindow.addEventListener('pagehide', cleanup, { once: true })
  window.addEventListener('beforeunload', cleanup, { once: true })

  root = ReactDOM.createRoot(container)
  root.render(<WidgetWrapper game={game} pipWindow={pipWindow} />)
}

/* ─── GameSelector ──────────────────────────────────────────────────── */

function isDelayedOrSuspended(g: MlbGame): boolean {
  const d = g.status.detailedState.toLowerCase()
  return d.includes('delay') || d.includes('suspend') || d === 'postponed'
}

function statePriority(g: MlbGame): number {
  if (g.status.abstractGameState === 'Live' && !isDelayedOrSuspended(g)) return 0
  if (isDelayedOrSuspended(g)) return 0.5
  if (g.status.abstractGameState === 'Final') return 1
  return 2
}

function isActive(g: MlbGame) {
  const s = g.status.abstractGameState
  return s === 'Live' || s === 'Final' || isDelayedOrSuspended(g)
}

function sortGames(games: MlbGame[]): MlbGame[] {
  return [...games].sort((a, b) => statePriority(a) - statePriority(b))
}

async function fetchGames(date: string): Promise<MlbGame[]> {
  const url = encodeURIComponent(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,venue`
  )
  const res = await fetch(`/api/scores?url=${url}`)
  if (!res.ok) throw new Error('Failed to fetch schedule')
  const data = await res.json()
  const allGames: MlbGame[] = (data.dates ?? []).flatMap(
    (d: { games?: MlbGame[] }) => d.games ?? []
  )
  const unique = Array.from(new Map(allGames.map((g) => [g.gamePk, g])).values())

  console.log(`[Sidewatch] schedule ${date} → ${unique.length} game(s)`)
  unique.forEach((g) =>
    console.log(
      `  ${g.gamePk}  ${g.teams.away.team.name} @ ${g.teams.home.team.name}` +
      `  abstractGameState="${g.status.abstractGameState}"` +
      `  detailedState="${g.status.detailedState}"`
    )
  )

  return unique
}

export default function GameSelector() {
  const [games, setGames] = useState<MlbGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heading, setHeading] = useState('Today\'s Games — MLB')
  const [launching, setLaunching] = useState<number | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const today = getTodayDate()
        const yesterday = getYesterdayDate()

        let games = await fetchGames(today)

        const todayHasActive = games.some(isActive)
        if (!todayHasActive) {
          console.log(
            `[Sidewatch] today (${today}) has no Live/Final games — checking yesterday (${yesterday})`
          )
          const yesterdayGames = await fetchGames(yesterday)
          const yesterdayHasActive = yesterdayGames.some(isActive)
          if (yesterdayGames.length > 0 && yesterdayHasActive) {
            games = yesterdayGames
            setHeading("Yesterday's Games — MLB")
          }
        }

        const unique = Array.from(new Map(games.map((g) => [g.gamePk, g])).values())
        setGames(sortGames(unique))
      } catch {
        setError('Failed to load games. Please try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleLaunch = async (game: MlbGame) => {
    setLaunching(game.gamePk)
    try {
      await launchPiPWidget(game)
    } finally {
      setLaunching(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-[#1A56DB] text-4xl mb-4 animate-pulse">⚾</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading today&apos;s games…
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No games scheduled today
        </p>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ background: 'var(--bg-page)' }}>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: 'var(--text-muted)' }}
      >
        {heading}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {games.map((game) => {
          const isLive    = game.status.abstractGameState === 'Live'
          const isFinal   = game.status.abstractGameState === 'Final'
          const isUpcoming = game.status.abstractGameState === 'Preview'
          const isDelayed = isDelayedOrSuspended(game)
          const isDoubleHeader = game.doubleHeader === 'Y' || game.doubleHeader === 'S'
          const awayAbbr  = getTeamAbbr(game.teams.away.team.name)
          const homeAbbr  = getTeamAbbr(game.teams.home.team.name)
          const ls        = game.linescore
          const inningLabel =
            isLive && !isDelayed && ls?.inningState && ls?.currentInningOrdinal
              ? `${ls.inningState} ${ls.currentInningOrdinal}`
              : null
          const isDisabled = (isUpcoming && !isDelayed) || launching === game.gamePk

          return (
            <div
              key={game.gamePk}
              className={[
                'rounded-lg border p-4 flex flex-col gap-3 transition-colors',
                (isLive && !isDelayed) || isDelayed ? 'col-span-1 sm:col-span-2 border-l-4' : '',
              ].join(' ')}
              style={{
                backgroundColor: (isLive && !isDelayed) ? 'var(--bg-live)' : 'var(--bg-surface)',
                borderColor: (isLive && !isDelayed)
                  ? 'var(--border-active)'
                  : isDelayed
                  ? '#d97706'
                  : 'var(--border-primary)',
              }}
            >
              {/* Teams + Score */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono font-bold text-base"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {awayAbbr}
                    </span>
                    <span
                      className="text-xs truncate max-w-[140px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {game.teams.away.team.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono font-bold text-base"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {homeAbbr}
                    </span>
                    <span
                      className="text-xs truncate max-w-[140px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {game.teams.home.team.name}
                    </span>
                  </div>
                </div>

                {/* Score or time */}
                <div className="flex flex-col items-end gap-1">
                  {(isLive || isFinal || isDelayed) && (
                    <>
                      <span
                        className="font-mono font-bold text-xl"
                        style={{
                          color: (game.teams.away.score ?? 0) > (game.teams.home.score ?? 0)
                            ? 'var(--score-winning)'
                            : 'var(--score-normal)',
                        }}
                      >
                        {game.teams.away.score ?? '–'}
                      </span>
                      <span
                        className="font-mono font-bold text-xl"
                        style={{
                          color: (game.teams.home.score ?? 0) > (game.teams.away.score ?? 0)
                            ? 'var(--score-winning)'
                            : 'var(--score-normal)',
                        }}
                      >
                        {game.teams.home.score ?? '–'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status pill + inning */}
              <div className="flex items-center gap-2">
                {isDoubleHeader && (
                  <span className="text-xs font-semibold bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                    Game {game.gameNumber}
                  </span>
                )}
                {isDelayed && (
                  <span className="text-xs font-bold bg-amber-700 text-white px-2 py-0.5 rounded">
                    DELAYED
                  </span>
                )}
                {isLive && !isDelayed && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-[#A32D2D] text-white px-2 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                      LIVE
                    </span>
                    {inningLabel && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {inningLabel}
                      </span>
                    )}
                  </>
                )}
                {isFinal && !isDelayed && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    FINAL
                  </span>
                )}
                {isUpcoming && !isDelayed && (
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Game starts at {formatGameTime(game.gameDate)} — check back then
                  </span>
                )}
              </div>

              {/* Launch button */}
              <button
                disabled={isDisabled}
                onClick={() => handleLaunch(game)}
                className={[
                  'w-full py-2 px-4 rounded-md text-sm font-semibold transition-all',
                  isDisabled
                    ? 'cursor-not-allowed'
                    : 'bg-[#1A56DB] hover:bg-blue-600 text-white cursor-pointer',
                ].join(' ')}
                style={isDisabled ? {
                  background: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                } : {}}
              >
                {launching === game.gamePk
                  ? 'Launching…'
                  : (isUpcoming && !isDelayed)
                  ? 'Not Started Yet'
                  : '⊞ Launch Widget'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
