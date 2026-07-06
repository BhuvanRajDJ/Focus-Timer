import { useEffect, useRef } from 'react'
import type { TimerStatus } from '../../../shared/types'
import { playAlarm, type AlarmHandle } from '../alarm/synth'

/**
 * Bridges alarm events to audio. Starts looping the chosen tone when main fires an alarm
 * (unless muted), and stops the moment the engine leaves `finished` — i.e. when the user
 * dismisses, cancels, or restarts. Guarantees no orphaned audio.
 *
 * Note: whichever window is open plays the tone. Mode-switching closes the other window,
 * so in normal use exactly one instance sounds.
 */
export function useAlarm(status: TimerStatus) {
  const handle = useRef<AlarmHandle | null>(null)

  const stop = () => {
    handle.current?.stop()
    handle.current = null
  }

  useEffect(() => {
    const off = window.focusTimer.onAlarm((p) => {
      stop()
      if (!p.muted) handle.current = playAlarm(p.sound)
    })
    return () => {
      off()
      stop()
    }
  }, [])

  // Any transition out of `finished` silences the alarm.
  useEffect(() => {
    if (status !== 'finished') stop()
  }, [status])

  // One-shot preview for the settings panel (auto-stops after one phrase).
  const previewSound = (s: Parameters<typeof playAlarm>[0]) => {
    const h = playAlarm(s)
    setTimeout(() => h.stop(), 1400)
  }
  return { previewSound }
}
