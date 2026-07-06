/** ms -> "MM:SS" (clamped at zero, minutes can exceed 99 for long added time). */
export function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Compact form for the tiny floating window: "24" (min) when >1m, else "45s". */
export function formatCompact(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  if (total >= 60) return String(Math.ceil(total / 60))
  return `${total}s`
}

import type { SessionType } from '../../../shared/types'

export const SESSION_LABEL: Record<SessionType, string> = {
  focus: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break'
}

export const SESSION_COLOR: Record<SessionType, string> = {
  focus: 'var(--focus)',
  shortBreak: 'var(--shortBreak)',
  longBreak: 'var(--longBreak)'
}

/** Ring color by how much time is left (green -> amber -> red). */
export function ringColor(fractionLeft: number): string {
  if (fractionLeft <= 0.15) return 'var(--ring-crit)'
  if (fractionLeft <= 0.4) return 'var(--ring-warn)'
  return 'var(--ring-ok)'
}
