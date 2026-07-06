import { useEffect, useState } from 'react'
import type { Config, AlarmSound } from '../../../shared/types'

const SOUNDS: AlarmSound[] = ['chime', 'beep', 'marimba']

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid var(--stroke)'
}
const numInput: React.CSSProperties = {
  width: 72,
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--stroke)',
  borderRadius: 8,
  padding: '6px 8px',
  fontFamily: 'var(--font-mono)'
}
const selInput: React.CSSProperties = { ...numInput, width: 110, fontFamily: 'var(--font)' }

export function Settings({ onClose, onPreview }: { onClose: () => void; onPreview: (s: AlarmSound) => void }) {
  const [cfg, setCfg] = useState<Config | null>(null)

  useEffect(() => {
    window.focusTimer.getConfig().then(setCfg)
  }, [])

  if (!cfg) return null

  // Persist a patch and reflect the sanitized result the main process returns.
  const patch = (p: Partial<Config>) => window.focusTimer.setConfig(p).then(setCfg)

  const num = (key: keyof Config, lo: number, hi: number) => (
    <input
      type="number"
      min={lo}
      max={hi}
      style={numInput}
      value={cfg[key] as number}
      onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<Config>)}
    />
  )

  const soundSel = (key: 'focusEndSound' | 'breakEndSound') => (
    <select
      style={selInput}
      value={cfg[key]}
      onChange={(e) => {
        const s = e.target.value as AlarmSound
        patch({ [key]: s } as Partial<Config>)
        onPreview(s)
      }}
    >
      {SOUNDS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )

  const toggle = (key: 'muteFocusEnd' | 'muteBreakEnd' | 'reopenInLastMode', label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={cfg[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<Config>)} />
      {label}
    </label>
  )

  return (
    <div
      role="dialog"
      aria-label="Settings"
      style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,16,0.72)', zIndex: 20, display: 'flex' }}
    >
      <div
        style={{
          margin: 'auto',
          width: 340,
          maxHeight: '92%',
          overflowY: 'auto',
          background: 'var(--bg-elev)',
          border: '1px solid var(--stroke)',
          borderRadius: 'var(--radius)',
          padding: 18
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--stroke)', borderRadius: 8, padding: '4px 10px' }}
          >
            Done
          </button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          <div style={{ ...row, borderBottom: 'none', color: 'var(--text-faint)', paddingBottom: 2 }}>Durations (minutes)</div>
          <div style={row}>
            <span>Focus</span>
            {num('focusMinutes', 1, 180)}
          </div>
          <div style={row}>
            <span>Short break</span>
            {num('shortBreakMinutes', 1, 180)}
          </div>
          <div style={row}>
            <span>Long break</span>
            {num('longBreakMinutes', 1, 180)}
          </div>
          <div style={row}>
            <span>Sessions before long break</span>
            {num('sessionsBeforeLongBreak', 2, 8)}
          </div>
          <div style={row}>
            <span>Add-time increment</span>
            {num('addTimeMinutes', 1, 60)}
          </div>

          <div style={{ ...row, borderBottom: 'none', color: 'var(--text-faint)', paddingTop: 12, paddingBottom: 2 }}>
            Alarms
          </div>
          <div style={row}>
            <span>Focus-end sound</span>
            {soundSel('focusEndSound')}
          </div>
          <div style={row}>
            <span>Break-end sound</span>
            {soundSel('breakEndSound')}
          </div>
          <div style={row}>{toggle('muteFocusEnd', 'Mute focus-end alarm')}</div>
          <div style={row}>{toggle('muteBreakEnd', 'Mute break-end alarm')}</div>

          <div style={{ ...row, borderBottom: 'none', color: 'var(--text-faint)', paddingTop: 12, paddingBottom: 2 }}>
            Startup
          </div>
          <div style={{ ...row, borderBottom: 'none' }}>{toggle('reopenInLastMode', 'Reopen in last used mode')}</div>
        </div>
      </div>
    </div>
  )
}
