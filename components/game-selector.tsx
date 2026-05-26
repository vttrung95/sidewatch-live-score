'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as ReactDOM from 'react-dom/client'
import BoxScore from './box-score'
import RedditFeed from './reddit-feed'
import { getTeamAbbr } from '@/lib/utils'
import { getTodayString, getYesterdayString, formatGameTime, shouldFallbackToYesterday } from '@/lib/locale'
import { upsertUserPreferences } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

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
  games,
  user,
  pipWindow,
}: {
  game: MlbGame
  games: MlbGame[]
  user: User | null
  pipWindow: Window
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('widget_collapsed') === 'true'
  )
  const [currentGame, setCurrentGame] = useState(initialGame)
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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<number | null>(null)
  const headerTriggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Poll score every 30s regardless of collapsed state
  useEffect(() => {
    const poll = async () => {
      try {
        const url = encodeURIComponent(
          `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${currentGame.gamePk}`
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
  }, [currentGame.gamePk])

  // Close dropdown on click outside (works in PiP via ownerDocument)
  useEffect(() => {
    if (!dropdownOpen) return
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        dropdownRef.current?.contains(target) ||
        headerTriggerRef.current?.contains(target)
      ) return
      setDropdownOpen(false)
    }
    const doc = dropdownRef.current?.ownerDocument ?? document
    doc.addEventListener('mousedown', handleOutsideClick)
    return () => doc.removeEventListener('mousedown', handleOutsideClick)
  }, [dropdownOpen])

  function handleGameChange(newGameId: number) {
    const newGame = games.find(g => g.gamePk === newGameId)
    if (!newGame) return
    setCurrentGame(newGame)
    setScore({ away: newGame.teams.away.score, home: newGame.teams.home.score })
    setGameState(newGame.status.abstractGameState)
    setGameDetailedState(newGame.status.detailedState)
    const ls = newGame.linescore
    setInningLabel(ls?.inningState && ls?.currentInningOrdinal
      ? `${ls.inningState} ${ls.currentInningOrdinal}`
      : '')
    localStorage.setItem('sidewatch_widget_game_id', String(newGameId))
    if (user) upsertUserPreferences(user.id, { widget_game_id: String(newGameId) })
  }

  // FIX 6: collapsed width 320px, height 72px
  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('widget_collapsed', String(next))
    try {
      pipWindow.resizeTo(next ? 320 : 260, next ? 72 : 420)
    } catch {}
  }, [collapsed, pipWindow])

  const awayAbbr = getTeamAbbr(currentGame.teams.away.team.name)
  const homeAbbr = getTeamAbbr(currentGame.teams.home.team.name)
  const isLive = gameState === 'Live'
  const isFinal = gameState === 'Final'
  const isDelayed = /delay|suspend/i.test(gameDetailedState) || gameDetailedState.toLowerCase() === 'postponed'

  const sortedGames = [...games].sort((a, b) => statePriority(a) - statePriority(b))

  return (
    <div style={{ position: 'relative', fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          width: '100%',
          height: collapsed ? '72px' : '420px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 200ms ease-in-out',
          background: 'var(--bg-widget)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header bar — keep brand blue, no variable */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            height: collapsed ? '72px' : '36px',
            background: '#1A56DB',
            flexShrink: 0,
          }}
        >
          {/* Clickable score area — toggles game dropdown */}
          <div
            ref={headerTriggerRef}
            onClick={() => games.length > 1 && !collapsed && setDropdownOpen(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: 1,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: games.length > 1 && !collapsed ? 'pointer' : 'default',
            }}
          >
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
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.3)',
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
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.3)',
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
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  flexShrink: 0,
                }}
              >
                FINAL
              </span>
            )}
            {/* Chevron — only shown when multiple games and widget is expanded */}
            {games.length > 1 && !collapsed && (
              <span style={{ marginLeft: 'auto', color: '#bfdbfe', fontSize: '10px', flexShrink: 0, paddingRight: '4px' }}>
                {dropdownOpen ? '▲' : '▼'}
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
              key={currentGame.gamePk}
              gameId={currentGame.gamePk}
              initialStatus={currentGame.status.abstractGameState}
              venueFallback={currentGame.venue?.name ?? ''}
              detailedStateFallback={gameDetailedState}
            />
            <RedditFeed
              awayTeam={currentGame.teams.away.team.name}
              homeTeam={currentGame.teams.home.team.name}
            />
          </div>
        )}
      </div>

      {/* Overlay — dims widget content behind the dropdown */}
      {dropdownOpen && games.length > 1 && (
        <div
          onClick={() => setDropdownOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 998,
          }}
        />
      )}

      {/* Game switch dropdown — sibling of overflow:hidden div so it's never clipped */}
      {dropdownOpen && games.length > 1 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '36px',
            left: 0,
            right: 0,
            zIndex: 999,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            maxHeight: '200px',
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {sortedGames.map((g) => {
            const isSelected = g.gamePk === currentGame.gamePk
            const gDelayed = isDelayedOrSuspended(g)
            const gState = g.status.abstractGameState
            const gAway = getTeamAbbr(g.teams.away.team.name)
            const gHome = getTeamAbbr(g.teams.home.team.name)
            const awayScore = g.teams.away.score
            const homeScore = g.teams.home.score
            const hasScore = gState === 'Live' || gState === 'Final' || gDelayed
            const isHovered = hoveredItem === g.gamePk

            return (
              <div
                key={g.gamePk}
                onMouseEnter={() => setHoveredItem(g.gamePk)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  setDropdownOpen(false)
                  if (!isSelected) handleGameChange(g.gamePk)
                }}
                style={{
                  padding: '7px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  background: isSelected
                    ? 'var(--accent)'
                    : isHovered
                    ? 'var(--bg-surface-2)'
                    : 'transparent',
                  color: '#ffffff',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{gAway} vs {gHome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {hasScore && (
                    <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                      {awayScore ?? '–'}–{homeScore ?? '–'}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 4px',
                      borderRadius: '3px',
                      color: '#fff',
                      background: gDelayed
                        ? '#B45309'
                        : gState === 'Live'
                        ? '#A32D2D'
                        : gState === 'Final'
                        ? '#4b5563'
                        : '#374151',
                    }}
                  >
                    {gDelayed ? 'DELAYED' : gState === 'Live' ? 'LIVE' : gState === 'Final' ? 'FINAL' : 'UPCOMING'}
                  </span>
                </div>
              </div>
            )
          })}
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

async function launchPiPWidget(game: MlbGame, games: MlbGame[], user: User | null) {
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
  root.render(<WidgetWrapper game={game} games={games} user={user} pipWindow={pipWindow} />)
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

interface GameSelectorProps {
  user: User | null
  savedGameId: string | null
}

export default function GameSelector({ user, savedGameId }: GameSelectorProps) {
  const [games, setGames] = useState<MlbGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heading, setHeading] = useState('Today\'s Games — MLB')
  const [launching, setLaunching] = useState<number | null>(null)
  const [highlightedGameId, setHighlightedGameId] = useState<number | null>(
    savedGameId ? parseInt(savedGameId) : null
  )
  const gameRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    ;(async () => {
      try {
        const today = getTodayString()
        const yesterday = getYesterdayString()

        let games = await fetchGames(today)

        if (shouldFallbackToYesterday(games.map((g) => ({ status: g.status.detailedState })))) {
          console.log(
            `[Sidewatch] today (${today}) has no Live/Final games — checking yesterday (${yesterday})`
          )
          const yesterdayGames = await fetchGames(yesterday)
          if (!shouldFallbackToYesterday(yesterdayGames.map((g) => ({ status: g.status.detailedState })))) {
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

  // Sync highlighted game when DB prefs arrive after initial render
  useEffect(() => {
    if (savedGameId) setHighlightedGameId(parseInt(savedGameId))
  }, [savedGameId])

  // Scroll to last-watched game once games are loaded
  useEffect(() => {
    if (!highlightedGameId || games.length === 0) return
    const el = gameRefs.current.get(highlightedGameId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [games, highlightedGameId])

  const handleLaunch = async (game: MlbGame) => {
    setLaunching(game.gamePk)
    setHighlightedGameId(game.gamePk)
    localStorage.setItem('sidewatch_widget_game_id', String(game.gamePk))
    if (user) {
      upsertUserPreferences(user.id, { widget_game_id: String(game.gamePk) })
    }
    try {
      await launchPiPWidget(game, games, user)
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
              ref={(el) => {
                if (el) gameRefs.current.set(game.gamePk, el)
                else gameRefs.current.delete(game.gamePk)
              }}
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
                ...(highlightedGameId === game.gamePk
                  ? { boxShadow: '0 0 0 2px #1a56db' }
                  : {}),
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
                {highlightedGameId === game.gamePk && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--brand-blue-bg)', color: '#60a5fa', border: '1px solid #1a56db55' }}
                  >
                    Last watched
                  </span>
                )}
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
