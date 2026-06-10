export default function WelcomeStep({ onNext, onSkip }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-12 relative overflow-hidden">
      {/* Geometric grid mesh */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.025)_1px,transparent_1px)] bg-[length:60px_60px] animate-grid-pulse" />

      {/* Dramatic radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(6,182,212,0.12)_0%,rgba(59,130,246,0.05)_30%,transparent_60%)] pointer-events-none" />

      {/* Ambient floating orbs */}
      <div className="absolute top-[20%] left-[15%] w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl animate-float-slow" />
      <div className="absolute bottom-[25%] right-[15%] w-48 h-48 bg-blue-500/5 rounded-full blur-3xl animate-float-slower" />
      <div className="absolute top-[40%] right-[25%] w-32 h-32 bg-cyan-400/5 rounded-full blur-3xl animate-float-slowest" />

      <div className="relative z-10 flex flex-col items-center gap-0">
        {/* Star icon — zoom-in burst */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/20 mb-6 text-white text-4xl animate-icon-burst">
          ✦
        </div>

        <h1 className="text-7xl font-extrabold tracking-tight leading-none animate-text-up" style={{ animationDelay: '0.5s' }}>
          Ready to Begin?
        </h1>

        <div className="h-0.5 w-16 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full mt-6 mb-4 animate-text-up" style={{ animationDelay: '0.6s' }} />

        <p className="text-xl text-[#A0AABF] max-w-lg leading-relaxed animate-text-up" style={{ animationDelay: '0.7s' }}>
          Your companion is ready and waiting. One quick check and you're in.
        </p>

        {/* Feature cards */}
        <div className="flex items-center justify-center gap-5 animate-text-up" style={{ marginTop: '40px', animationDelay: '0.85s' }}>
          <div className="group flex flex-col items-center gap-2 px-5 py-4 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] cursor-default min-w-[140px]"
            style={{ border: 'none', transition: 'all 0.3s' }}
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white/80 group-hover:text-white" style={{ transition: 'color 0.3s' }}>AI Chat</span>
            <span className="text-xs text-white/50">Natural conversations</span>
          </div>

          <div className="group flex flex-col items-center gap-2 px-5 py-4 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] cursor-default min-w-[140px]"
            style={{ border: 'none', transition: 'all 0.3s' }}
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white/80 group-hover:text-white" style={{ transition: 'color 0.3s' }}>3D Avatar</span>
            <span className="text-xs text-white/50">Animated companion</span>
          </div>

          <div className="group flex flex-col items-center gap-2 px-5 py-4 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] cursor-default min-w-[140px]"
            style={{ border: 'none', transition: 'all 0.3s' }}
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white/80 group-hover:text-white" style={{ transition: 'color 0.3s' }}>Voice</span>
            <span className="text-xs text-white/50">Text-to-speech</span>
          </div>
        </div>

        <div className="h-10 w-full" />
        <div className="flex flex-col items-center gap-3 animate-text-up" style={{ animationDelay: '1s' }}>
          <button
            onClick={onNext}
            className="inline-flex items-center justify-center gap-2 font-medium text-sm"
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <span>Let's Check</span>
            <span>→</span>
          </button>
          <button
            onClick={onSkip}
            className="text-white/30 hover:text-white/70 font-medium transition-colors duration-200 text-sm"
          >
            Skip Setup
          </button>
        </div>
      </div>
    </div>
  );
}
