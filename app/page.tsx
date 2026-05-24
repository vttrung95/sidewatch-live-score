import GameSelector from '@/components/game-selector'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f1824] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="text-3xl">⚾</span>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sidewatch</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Live MLB games · Float any game as a mini widget
            </p>
          </div>
        </div>

        {/* PiP support notice */}
        <div className="mb-6 rounded-lg border border-[#1A56DB]/30 bg-[#1A56DB]/10 px-4 py-3 text-xs text-blue-300">
          <strong>Tip:</strong> Launch Widget opens a floating Picture-in-Picture window you can
          keep visible while you work. Requires Chrome 116+ or Edge 116+.
        </div>

        <GameSelector />
      </div>
    </main>
  )
}
