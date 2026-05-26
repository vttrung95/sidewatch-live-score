'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, upsertUserPreferences, loadUserPreferences } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { Sun, Moon, MessageSquare } from 'lucide-react'
import GameSelector from '@/components/game-selector'
import { getTimezoneLabel, getActiveLanguage, getActiveTimezone, setLanguage, setTimezone } from '@/lib/locale'
import type { SupportedLanguage } from '@/lib/locale'

export default function Home() {
  // true = dark (default, no class on html); false = light (html.light)
  const [isDark, setIsDark] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<'bug' | 'suggestion' | 'other'>('suggestion')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [timezoneLabel, setTimezoneLabel] = useState('...')
  const [user, setUser] = useState<User | null>(null)
  const [widgetGameId, setWidgetGameId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const syncedUserIdRef = useRef<string | null>(null)
  const [showLocalePopup, setShowLocalePopup] = useState(false)
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>('en')
  const [selectedTimezone, setSelectedTimezone] = useState('auto')
  const localePopupRef = useRef<HTMLDivElement>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authStep, setAuthStep] = useState<'input' | 'sent' | 'loading'>('input')
  const [authError, setAuthError] = useState('')

  function applyTheme(theme: string) {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.body.style.backgroundColor = '#f8fafc'
      localStorage.setItem('sidewatch_theme', 'light')
      setIsDark(false)
    } else {
      document.documentElement.classList.remove('light')
      document.body.style.backgroundColor = '#0f1824'
      localStorage.setItem('sidewatch_theme', 'dark')
      setIsDark(true)
    }
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('sidewatch_theme') ?? 'dark'
    applyTheme(savedTheme)
    if (!localStorage.getItem('sidewatch_sport')) {
      localStorage.setItem('sidewatch_sport', 'mlb')
    }
    const savedGameId = localStorage.getItem('sidewatch_widget_game_id')
    if (savedGameId) setWidgetGameId(savedGameId)
    setActiveLanguage(getActiveLanguage())
    const savedTz = localStorage.getItem('sidewatch_timezone')
    setSelectedTimezone(savedTz ?? 'auto')
  }, [])

  // Sync preferences with DB on login
  useEffect(() => {
    if (!user) {
      syncedUserIdRef.current = null
      return
    }
    if (syncedUserIdRef.current === user.id) return
    syncedUserIdRef.current = user.id

    ;(async () => {
      const { data, error } = await loadUserPreferences(user.id)
      if (data && !error) {
        if (data.theme) applyTheme(data.theme)
        if (data.widget_game_id) setWidgetGameId(data.widget_game_id)
        if (data.language) {
          setLanguage(data.language as SupportedLanguage)
          setActiveLanguage(data.language as SupportedLanguage)
        }
        if (data.timezone) {
          setTimezone(data.timezone)
          setSelectedTimezone(data.timezone)
          setTimezoneLabel(getTimezoneLabel(data.timezone))
        }
      } else {
        // New user — push current local state to DB
        const currentTheme = localStorage.getItem('sidewatch_theme') ?? 'dark'
        const currentGameId = localStorage.getItem('sidewatch_widget_game_id')
        await upsertUserPreferences(user.id, {
          theme: currentTheme,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: 'en',
          ...(currentGameId ? { widget_game_id: currentGameId } : {}),
        })
      }
    })()
  }, [user])

  useEffect(() => {
    setTimezoneLabel(getTimezoneLabel())
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  function handleLanguageChange(lang: SupportedLanguage) {
    setLanguage(lang)
    setActiveLanguage(lang)
    if (user) upsertUserPreferences(user.id, { language: lang })
  }

  function handleTimezoneChange(tz: string) {
    setSelectedTimezone(tz)
    if (tz === 'auto') {
      localStorage.removeItem('sidewatch_timezone')
      setTimezoneLabel(getTimezoneLabel())
      if (user) upsertUserPreferences(user.id, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    } else {
      setTimezone(tz)
      setTimezoneLabel(getTimezoneLabel(tz))
      if (user) upsertUserPreferences(user.id, { timezone: tz })
    }
  }

  useEffect(() => {
    if (!showLocalePopup) return
    function handleClickOutside(e: MouseEvent) {
      if (localePopupRef.current && !localePopupRef.current.contains(e.target as Node)) {
        setShowLocalePopup(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLocalePopup])

  function toggleTheme() {
    const newTheme = isDark ? 'light' : 'dark'
    applyTheme(newTheme)
    if (user) {
      upsertUserPreferences(user.id, { theme: newTheme })
    }
  }

  async function handleFeedbackSubmit() {
    if (description.length < 10) {
      setSubmitError('Please enter at least 10 characters.')
      return
    }
    setSubmitError('')
    setIsLoading(true)
    try {
      const { error } = await supabase.from('feedback').insert({
        type: feedbackType,
        description: description,
        contact_email: email || null,
        user_agent: navigator.userAgent,
        page_url: window.location.href,
      })
      if (error) throw error
      setSubmitted(true)
      setTimeout(() => {
        setFeedbackOpen(false)
        setSubmitted(false)
        setDescription('')
        setEmail('')
      }, 2000)
    } catch {
      setSubmitError('Something went wrong. Try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignIn = async () => {
    if (!authEmail || !authEmail.includes('@')) {
      setAuthError('Please enter a valid email address.')
      return
    }
    setAuthStep('loading')
    setAuthError('')

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setAuthError(error.message)
      setAuthStep('input')
    } else {
      setAuthStep('sent')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const closeAuthModal = () => {
    setShowAuthModal(false)
    setAuthStep('input')
    setAuthEmail('')
    setAuthError('')
  }

  // Only items that cannot be expressed as pure CSS variables
  const tk = {
    heroBg: isDark
      ? 'linear-gradient(160deg, #0f1824 0%, #162132 60%, #1a2a3a 100%)'
      : 'linear-gradient(160deg, #eff6ff 0%, #dbeafe 60%, #e8f0fe 100%)',
    tipBg:     isDark ? '#1c150a'              : '#fefce8',
    tipBorder: isDark ? 'rgba(120,53,15,0.4)'  : '#fde68a',
    tipText:   isDark ? '#fcd34d'              : '#92400e',
    tipStrong: isDark ? '#fbbf24'              : '#b45309',
    footerBtnCls: isDark
      ? 'text-slate-500 hover:text-slate-300'
      : 'text-slate-400 hover:text-slate-700',
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}
    >

      {/* SECTION 1: HERO */}
      <div
        style={{
          background: tk.heroBg,
          borderBottom: '1px solid var(--border-primary)',
          padding: '28px 24px 24px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(26,86,219,0.08) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div className="relative max-w-3xl mx-auto flex flex-row justify-between items-center gap-4">
          <div className="flex flex-row items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl text-2xl flex-shrink-0"
              style={{ width: 40, height: 40, background: '#1a56db' }}
            >
              ⚾
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Sidewatch
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Your game. On the side.
              </div>
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-[11px] leading-relaxed max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>
              Follow live MLB scores in a floating widget —
              without leaving your work.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: SPORT SELECTOR */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-7">
        <div
          className="text-[10px] font-semibold tracking-widest uppercase mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Select your sport
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">

          {/* MLB — active */}
          <div
            className="relative rounded-xl p-3.5 text-center transition-colors duration-150"
            style={{ border: '1.5px solid var(--border-active)', backgroundColor: 'var(--brand-blue-bg)' }}
          >
            <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#1a56db] rounded-full flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">✓</span>
            </div>
            <span className="text-xl mb-1.5 block">⚾</span>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Baseball</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>MLB</div>
          </div>

          {/* NBA — disabled */}
          <div
            className="relative rounded-xl p-3.5 text-center transition-colors duration-150 opacity-50 cursor-not-allowed pointer-events-none"
            style={{ border: '1.5px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}
          >
            <div
              className="absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Soon
            </div>
            <span className="text-xl mb-1.5 block">🏀</span>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Basketball</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>NBA</div>
          </div>

          {/* F1 — disabled */}
          <div
            className="relative rounded-xl p-3.5 text-center transition-colors duration-150 opacity-50 cursor-not-allowed pointer-events-none"
            style={{ border: '1.5px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}
          >
            <div
              className="absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Soon
            </div>
            <span className="text-xl mb-1.5 block">🏎</span>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Formula 1</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>F1</div>
          </div>

          {/* EPL — disabled */}
          <div
            className="relative rounded-xl p-3.5 text-center transition-colors duration-150 opacity-50 cursor-not-allowed pointer-events-none"
            style={{ border: '1.5px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}
          >
            <div
              className="absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Soon
            </div>
            <span className="text-xl mb-1.5 block">⚽</span>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Soccer</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>EPL</div>
          </div>

        </div>
      </div>

      {/* SECTION 3: HOW IT WORKS */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6">
        <div
          className="text-[10px] font-semibold tracking-widest uppercase mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          How it works
        </div>
        <div className="flex flex-col sm:flex-row gap-0 mb-3">

          {/* Step 1 */}
          <div className="flex-1 flex flex-col items-center text-center relative px-2">
            <div
              className="absolute right-0 top-[17px] w-5 h-px hidden sm:block"
              style={{ backgroundColor: 'var(--border-primary)' }}
            />
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] mb-2"
              style={{ backgroundColor: 'var(--brand-blue-bg)', border: '1px solid var(--border-primary)' }}
            >
              📋
            </div>
            <div className="text-[9px] font-bold text-[#1a56db] tracking-wider mb-1">STEP 1</div>
            <div className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>
              Pick a live game
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex-1 flex flex-col items-center text-center relative px-2">
            <div
              className="absolute right-0 top-[17px] w-5 h-px hidden sm:block"
              style={{ backgroundColor: 'var(--border-primary)' }}
            />
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] mb-2"
              style={{ backgroundColor: 'var(--brand-blue-bg)', border: '1px solid var(--border-primary)' }}
            >
              🪟
            </div>
            <div className="text-[9px] font-bold text-[#1a56db] tracking-wider mb-1">STEP 2</div>
            <div className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>
              Launch the widget
            </div>
          </div>

          {/* Step 3 — no connector */}
          <div className="flex-1 flex flex-col items-center text-center relative px-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] mb-2"
              style={{ backgroundColor: 'var(--brand-blue-bg)', border: '1px solid var(--border-primary)' }}
            >
              ✅
            </div>
            <div className="text-[9px] font-bold text-[#1a56db] tracking-wider mb-1">STEP 3</div>
            <div className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>
              Stay in the game
            </div>
          </div>

        </div>

        {/* Tip box — amber colors still need isDark conditional */}
        <div
          className="rounded-lg px-3.5 py-2.5 flex items-start gap-2"
          style={{ backgroundColor: tk.tipBg, border: `1px solid ${tk.tipBorder}` }}
        >
          <span className="text-xs flex-shrink-0 mt-0.5">⚠️</span>
          <span className="text-xs leading-relaxed" style={{ color: tk.tipText }}>
            <strong style={{ color: tk.tipStrong }}>Keep this tab open</strong>
            {' '}— the widget floats above all your other windows.
            You can minimize this tab anytime.
          </span>
        </div>
      </div>

      {/* SECTION 4: TODAY'S GAMES */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6">
        <GameSelector user={user} savedGameId={widgetGameId} />
      </div>

      {/* SECTION 5: FOOTER */}
      <div
        className="mt-10 pt-5 pb-6"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8">

          <div className="flex justify-between items-center mb-4">
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-1.5 text-xs transition-colors ${tk.footerBtnCls}`}
            >
              {isDark ? <Moon size={13} /> : <Sun size={13} />}
              {isDark ? 'Dark mode' : 'Light mode'}
            </button>
            <button
              onClick={() => setFeedbackOpen(true)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${tk.footerBtnCls}`}
            >
              <MessageSquare size={13} />
              Feedback
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-xs underline hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-xs underline hover:opacity-70 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
              >
                Sign in
              </button>
            )}
          </div>

          <div className="mb-3" style={{ borderTop: '1px solid var(--border-primary)' }} />

          <div className="text-center">
            <div className="relative inline-block mb-1" ref={localePopupRef}>
              <p
                className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setShowLocalePopup((v) => !v)}
              >
                <span className="underline underline-offset-2 decoration-slate-700">
                  Language: {activeLanguage.toUpperCase()}
                </span>
                {' · '}
                <span className="underline underline-offset-2 decoration-slate-700">
                  Timezone: {timezoneLabel}
                </span>
              </p>

              {showLocalePopup && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl shadow-xl z-40"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    padding: '16px',
                  }}
                >
                  {/* Language */}
                  <div className="mb-4">
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Language
                    </div>
                    <div className="flex gap-2">
                      {(['en', 'vi'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => handleLanguageChange(lang)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={
                            activeLanguage === lang
                              ? { background: '#1A56DB', color: '#fff', border: '1px solid #1A56DB' }
                              : { background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }
                          }
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timezone */}
                  <div>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Timezone
                    </div>
                    <select
                      value={selectedTimezone}
                      onChange={(e) => handleTimezoneChange(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="auto">Auto-detect (browser default)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (ET)</option>
                      <option value="America/Chicago">America/Chicago (CT)</option>
                      <option value="America/Denver">America/Denver (MT)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Europe/Paris">Europe/Paris (CET)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              Requires Chrome 116+ or Edge 116+
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Sidewatch © 2025 · Built for the fan at work
            </div>
          </div>
        </div>
      </div>

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeAuthModal()}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold">Sign in to Sidewatch</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Save preferences & sync across devices
                </p>
              </div>
              <button
                onClick={closeAuthModal}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:opacity-70"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {authStep === 'sent' ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">📬</div>
                <p className="font-medium mb-1">Check your email</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Magic link sent to <strong>{authEmail}</strong>
                </p>
                <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                  Click the link in the email to sign in. You can close this.
                </p>
                <button
                  onClick={closeAuthModal}
                  className="mt-5 w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Got it
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => { setAuthEmail(e.target.value); setAuthError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                    placeholder="you@example.com"
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                    style={{
                      background: 'var(--bg-secondary)',
                      borderColor: authError ? '#ef4444' : 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  {authError && (
                    <p className="text-xs mt-1.5 text-red-400">{authError}</p>
                  )}
                </div>

                <button
                  onClick={handleSignIn}
                  disabled={authStep === 'loading'}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {authStep === 'loading' ? 'Sending...' : 'Send magic link ✨'}
                </button>

                <p className="text-xs text-center mt-4" style={{ color: 'var(--text-secondary)' }}>
                  No password needed. We'll email you a sign-in link.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* FEEDBACK MODAL */}
      {feedbackOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-5"
          onClick={() => setFeedbackOpen(false)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-sm"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Send feedback
              </span>
              <button
                onClick={() => setFeedbackOpen(false)}
                className="text-lg leading-none"
                style={{ color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-5 text-sm text-[#4ade80]">
                ✓ Thanks! We&apos;ll review your feedback.
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 mb-3.5">
                  {(['bug', 'suggestion', 'other'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFeedbackType(type)}
                      className="flex-1 py-1.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer"
                      style={{
                        borderColor: feedbackType === type ? 'var(--border-active)' : 'var(--border-primary)',
                        background:  feedbackType === type ? 'var(--brand-blue-bg)' : 'var(--bg-input)',
                        color:       feedbackType === type ? '#60a5fa' : 'var(--text-muted)',
                      }}
                    >
                      {type === 'bug' ? '🐛 Bug' : type === 'suggestion' ? '💡 Suggestion' : '💬 Other'}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Description *
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  placeholder="Tell us what happened or what you'd like to see..."
                  className="w-full rounded-md text-xs p-2.5 resize-none h-20 outline-none font-[inherit]"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div className="text-[10px] text-right mt-1 mb-3" style={{ color: 'var(--text-dimmed)' }}>
                  {description.length} / 500
                </div>

                <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Email{' '}
                  <span style={{ color: 'var(--text-dimmed)' }}>(optional)</span>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-md text-xs p-2.5 py-2 outline-none font-[inherit] mb-4"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />

                {submitError && (
                  <div className="text-[11px] text-red-400 mb-2">{submitError}</div>
                )}
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={isLoading}
                  className="w-full py-2 rounded-md bg-[#1a56db] text-white text-xs font-semibold disabled:opacity-60"
                >
                  {isLoading ? 'Sending...' : 'Send Feedback'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
