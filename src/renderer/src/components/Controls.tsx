import type { TimerStatus, ControlCommand } from '../../../shared/types'

interface Props {
  status: TimerStatus
  addLabel: string
  onCommand: (cmd: ControlCommand) => void
  onDismiss: () => void
  compact?: boolean
}

const baseBtn = (compact: boolean, primary = false): React.CSSProperties => ({
  border: '1px solid var(--stroke)',
  borderRadius: 10,
  padding: compact ? '6px 8px' : '10px 14px',
  fontSize: compact ? 12 : 14,
  fontWeight: 600,
  background: primary ? 'var(--accent)' : 'var(--bg-elev-2)',
  color: primary ? '#0c0f14' : 'var(--text)',
  minWidth: compact ? 0 : 84,
  transition: 'opacity 0.15s, background 0.15s'
})

function Btn({
  label,
  onClick,
  disabled,
  compact,
  primary,
  title
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  compact: boolean
  primary?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      style={{ ...baseBtn(compact, primary), opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {label}
    </button>
  )
}

/**
 * All six controls, presented by status. Pause/Resume share the primary slot (only one
 * is valid at a time); Start and Dismiss take that slot when relevant. Restart / Add /
 * Cancel sit in the secondary row. Identical logic drives the floating window's overlay.
 */
export function Controls({ status, addLabel, onCommand, onDismiss, compact = false }: Props) {
  const running = status === 'running'
  const paused = status === 'paused'
  const idle = status === 'idle'

  let primary: React.ReactNode
  if (idle) {
    primary = <Btn label="Start" primary compact={compact} onClick={() => onCommand({ type: 'start' })} />
  } else if (running) {
    primary = <Btn label="Pause" primary compact={compact} onClick={() => onCommand({ type: 'pause' })} />
  } else if (paused) {
    primary = <Btn label="Resume" primary compact={compact} onClick={() => onCommand({ type: 'resume' })} />
  } else {
    // finished: acknowledge the alarm to auto-advance
    primary = <Btn label="Dismiss" primary compact={compact} onClick={onDismiss} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10, width: '100%' }}>
      <div style={{ display: 'flex', gap: compact ? 6 : 10 }}>{primary}</div>
      <div style={{ display: 'flex', gap: compact ? 6 : 10, flexWrap: 'wrap' }}>
        <Btn
          label="Restart"
          compact={compact}
          disabled={idle}
          onClick={() => onCommand({ type: 'restart' })}
          title="Reset current session to full duration"
        />
        <Btn
          label={addLabel}
          compact={compact}
          disabled={!(running || paused)}
          onClick={() => onCommand({ type: 'addTime' })}
          title="Add time to the current session"
        />
        <Btn
          label="Cancel"
          compact={compact}
          disabled={idle}
          onClick={() => onCommand({ type: 'cancel' })}
          title="End session without completing it"
        />
      </div>
    </div>
  )
}
