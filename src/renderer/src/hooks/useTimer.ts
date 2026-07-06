import { useEffect, useRef, useState } from 'react'
import type { ControlCommand, TimerState } from '../../../shared/types'

const INITIAL: TimerState = {
  status: 'idle',
  sessionType: 'focus',
  endTimestamp: null,
  remainingMs: 0,
  totalMs: 0,
  completedCount: 0,
  endedType: null
}

/**
 * Subscribes to the single main-process engine and derives a smooth live `remaining`
 * from `endTimestamp` on the client. Authoritative transitions still come from main via
 * onState — this only interpolates between them, so the two windows can never disagree
 * about anything but sub-frame display timing.
 *
 * Re-renders are throttled to ~10fps (only when the shown 100ms bucket changes) to keep
 * the always-on floating window off the CPU.
 */
export function useTimer() {
  const [state, setState] = useState<TimerState>(INITIAL)
  const [remainingMs, setRemainingMs] = useState(0)
  const stateRef = useRef(state)
  const lastBucket = useRef(-1)

  useEffect(() => {
    let mounted = true
    window.focusTimer.getState().then((s) => {
      if (mounted) {
        setState(s)
        stateRef.current = s
      }
    })
    const off = window.focusTimer.onState((s) => {
      stateRef.current = s
      setState(s)
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'running') {
      setRemainingMs(state.remainingMs)
      return
    }

    let raf = 0
    const loop = () => {
      const s = stateRef.current
      let rem = s.remainingMs
      if (s.status === 'running' && s.endTimestamp !== null) {
        rem = Math.max(0, s.endTimestamp - Date.now())
      }
      const bucket = Math.floor(rem / 100)
      if (bucket !== lastBucket.current) {
        lastBucket.current = bucket
        setRemainingMs(rem)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.status])

  const control = (cmd: ControlCommand) => window.focusTimer.control(cmd)

  const fractionLeft = state.totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / state.totalMs)) : 1

  return {
    state,
    remainingMs: state.status === 'idle' ? state.remainingMs : remainingMs,
    fractionLeft,
    control,
    dismiss: () => window.focusTimer.dismissAlarm()
  }
}
