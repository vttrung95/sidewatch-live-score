'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Sun, Moon, MessageSquare } from 'lucide-react'
import GameSelector from '@/components/game-selector'
import { getTimezoneLabel } from '@/lib/locale'

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

  useEffect(() => {
    const savedTheme = localStorage.getItem('sidewatch_theme')
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light')
      document.body.style.backgroundColor = '#f8fafc'
      setIsDark(false)
    } else {
      document.documentElement.classList.remove('light')
      document.body.style.backgroundColor = '#0f1824'
      // isDark already true by default
    }
    if (!localStorage.getItem('sidewatch_sport')) {
      localStorage.setItem('sidewatch_sport', 'mlb')
    }
  }, [])

  useEffect(() => {
    setTimezoneLabel(getTimezoneLabel())
  }, [])

  function toggleTheme() {
    const newIsDark = !isDark
    if (newIsDark) {
      // switching to dark — remove light class
      document.documentElement.classList.remove('light')
      document.body.style.backgroundColor = '#0f1824'
      localStorage.setItem('sidewatch_theme', 'dark')
    } else {
      // switching to light — add light class
      document.documentElement.classList.add('light')
      document.body.style.backgroundColor = '#f8fafc'
      localStorage.setItem('sidewatch_theme', 'light')
    }
    setIsDark(newIsDark)
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
        <GameSelector />
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
            <span
              className="text-xs cursor-not-allowed"
              style={{ color: 'var(--text-muted)' }}
              title="Coming soon"
            >
              Sign in
            </span>
          </div>

          <div className="mb-3" style={{ borderTop: '1px solid var(--border-primary)' }} />

          <div className="text-center">
            <p className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="cursor-pointer hover:text-slate-200 transition-colors underline underline-offset-2 decoration-slate-700"
                title="Language settings — coming soon"
              >
                Language: EN
              </span>
              {' · '}
              <span
                className="cursor-pointer hover:text-slate-200 transition-colors underline underline-offset-2 decoration-slate-700"
                title="Timezone settings — coming soon"
              >
                Timezone: {timezoneLabel}
              </span>
            </p>
            <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              Requires Chrome 116+ or Edge 116+
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Sidewatch © 2025 · Built for the fan at work
            </div>
          </div>
        </div>
      </div>

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
