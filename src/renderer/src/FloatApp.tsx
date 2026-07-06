import { useEffect, useState } from 'react'
import { useTimer } from './hooks/useTimer'
import { useAlarm } from './hooks/useAlarm'
import { formatMMSS, SESSION_COLOR } from './lib/format'

export function FloatApp() {
  const { state, remainingMs, control, dismiss } = useTimer()
  useAlarm(state.status)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', SESSION_COLOR[state.sessionType])
  }, [state.sessionType])

  const finished = state.status === 'finished'

  const handlePlayPause = () => {
    if (state.status === 'idle') {
      control({ type: 'start' })
    } else if (state.status === 'running') {
      control({ type: 'pause' })
    } else if (state.status === 'paused') {
      control({ type: 'resume' })
    }
  }

  const handleRestartDismiss = () => {
    if (finished) {
      dismiss()
    } else {
      control({ type: 'restart' })
    }
  }

  return (
    <div
      className="float-container"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Left: Indicator & Time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          className="float-status-dot"
          style={{ backgroundColor: 'var(--accent)' }}
          title={state.sessionType}
        />
        <div className="mono float-time">
          {formatMMSS(remainingMs)}
        </div>
      </div>

      {/* Right: Controls (fade/slide in on hover) */}
      <div
        className="float-controls"
        style={{
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateX(0)' : 'translateX(6px)',
          pointerEvents: hover ? 'auto' : 'none',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        <button
          className="float-btn"
          onClick={handlePlayPause}
          title={state.status === 'running' ? 'Pause' : 'Start/Resume'}
        >
          {state.status === 'running' ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          className="float-btn"
          onClick={handleRestartDismiss}
          title={finished ? 'Dismiss' : 'Restart'}
        >
          {finished ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
        </button>
        <button
          className="float-btn"
          onClick={() => window.focusTimer.openMain()}
          title="Open full window"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

