import { Notification } from 'electron'
import type { SessionType } from '../shared/types'

const COPY: Record<SessionType, { title: string; body: string }> = {
  focus: { title: 'Focus session complete', body: 'Nice work — time for a break.' },
  shortBreak: { title: 'Short break over', body: 'Back to focus when you are ready.' },
  longBreak: { title: 'Long break over', body: 'Ready for the next cycle.' }
}

/**
 * Fire a native Windows toast alongside the audio alarm, so a session-end stays visible
 * even when the floating window is occluded. Windows Focus Assist / DND is respected by
 * the OS notification layer (best-effort; we don't override it).
 */
export function notifySessionEnd(endedType: SessionType) {
  if (!Notification.isSupported()) return
  const { title, body } = COPY[endedType]
  new Notification({ title, body, silent: true }).show() // silent: our own alarm handles audio
}
