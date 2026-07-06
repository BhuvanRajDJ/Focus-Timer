import type { ReactNode } from 'react'

interface Props {
  size: number
  stroke: number
  /** 1 = full, 0 = empty. The arc depletes as time runs out. */
  fractionLeft: number
  color: string
  trackColor?: string
  children?: ReactNode
}

/**
 * The app's signature element. A single SVG ring whose arc shrinks with remaining time;
 * the same component renders at 300px in the main window and ~40px in the floating one,
 * so the identity survives all the way down.
 */
export function ProgressRing({ size, stroke, fractionLeft, color, trackColor = 'var(--ring-track)', children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, fractionLeft))
  const offset = c * (1 - clamped)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          // Only transition on discrete jumps; continuous ticking is driven by JS so this
          // won't fight the per-frame updates.
          style={{ transition: 'stroke 0.4s linear' }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
