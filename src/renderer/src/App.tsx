import { useEffect, useState } from 'react'
import { useTimer } from './hooks/useTimer'
import { useAlarm } from './hooks/useAlarm'
import { ProgressRing } from './components/ProgressRing'
import { SessionBadge } from './components/SessionBadge'
import { Controls } from './components/Controls'
import { Settings } from './components/Settings'
import { formatMMSS, SESSION_COLOR, ringColor } from './lib/format'
import type { Config } from '../../shared/types'

export function App() {
  const { state, remainingMs, fractionLeft, control, dismiss } = useTimer()
  const { previewSound } = useAlarm(state.status)
  const [showSettings, setShowSettings] = useState(false)
  const [cfg, setCfg] = useState<Config | null>(null)

  useEffect(() => {
    window.focusTimer.getConfig().then(setCfg)
    return window.focusTimer.onConfig(setCfg)
  }, [])

  // Drive the global accent from the current session type.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', SESSION_COLOR[state.sessionType])
  }, [state.sessionType])

  const finished = state.status === 'finished'
  const sessionsBeforeLong = cfg?.sessionsBeforeLongBreak ?? 4
  const addLabel = `+${cfg?.addTimeMinutes ?? 5}m`

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 22px',
        gap: 16,
        position: 'relative'
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <SessionBadge type={state.sessionType} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            aria-label="Floating mini-window"
            title="Floating mini-window"
            onClick={() => window.focusTimer.openFloat()}
            style={iconBtn}
          >
            ⧉
          </button>
          <button aria-label="Settings" title="Settings" onClick={() => setShowSettings(true)} style={iconBtn}>
            ⚙
          </button>
        </div>
      </div>

      {/* ring + time */}
      <ProgressRing size={236} stroke={16} fractionLeft={fractionLeft} color={ringColor(fractionLeft)}>
        <div className="mono" style={{ fontSize: 52, fontWeight: 600, letterSpacing: 1 }}>
          {formatMMSS(remainingMs)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
          {finished ? 'Session complete' : state.status === 'paused' ? 'Paused' : state.status === 'idle' ? 'Ready' : 'Remaining'}
        </div>
      </ProgressRing>

      {/* cycle progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: sessionsBeforeLong }).map((_, i) => (
            <span
              key={i}
              title={`${state.completedCount} of ${sessionsBeforeLong} focus sessions this cycle`}
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: i < state.completedCount ? 'var(--focus)' : 'var(--bg-elev-2)',
                border: '1px solid var(--stroke)'
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {state.completedCount}/{sessionsBeforeLong} to long break
        </span>
      </div>

      {finished && (
        <div style={{ fontSize: 13, color: 'var(--ring-warn)', fontWeight: 600 }}>
          Alarm sounding — Dismiss to start the next session
        </div>
      )}

      {/* controls */}
      <div style={{ marginTop: 'auto', width: '100%' }}>
        <Controls status={state.status} addLabel={addLabel} onCommand={control} onDismiss={dismiss} />
      </div>

      {showSettings && <Settings onClose={() => setShowSettings(false)} onPreview={previewSound} />}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--stroke)',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}
