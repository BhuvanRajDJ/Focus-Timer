import type { SessionType } from '../../../shared/types'
import { SESSION_LABEL, SESSION_COLOR } from '../lib/format'

/**
 * Session type is conveyed by a text LABEL plus a colored dot and a shape hint — never
 * color alone (accessibility floor). Focus = filled dot, breaks = hollow dot.
 */
export function SessionBadge({ type }: { type: SessionType }) {
  const isFocus = type === 'focus'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        borderRadius: 999,
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--stroke)',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.3
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: isFocus ? SESSION_COLOR[type] : 'transparent',
          border: `2px solid ${SESSION_COLOR[type]}`
        }}
      />
      {SESSION_LABEL[type]}
    </div>
  )
}
