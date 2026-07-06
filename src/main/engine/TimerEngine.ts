import type { Config, SessionType, TimerState } from '../../shared/types'

/**
 * Drift-corrected Pomodoro state machine. Pure TypeScript — no Electron/DOM — so it
 * runs headless under vitest. The single source of truth: both windows are views onto
 * one instance living in the main process.
 *
 * Key correctness properties:
 *  - Time is NEVER decremented by a counter. We store an absolute `endTimestamp` and
 *    derive `remaining = endTimestamp - now()` on demand. This is immune to setInterval
 *    drift and to the OS sleeping mid-session: on wake, the first tick sees now() past
 *    endTimestamp and finishes the session correctly.
 *  - `finished` is a distinct state: the session hit zero and the alarm is sounding, but
 *    the next session does NOT auto-start until the user dismisses (see dismiss()).
 */

type EngineEvent = 'state' | 'alarm'

/** Config fields the engine actually needs (durations + cycle rules). */
type EngineConfig = Pick<
  Config,
  'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'sessionsBeforeLongBreak' | 'addTimeMinutes'
>

const MIN = 60_000

export class TimerEngine {
  private status: TimerState['status'] = 'idle'
  private sessionType: SessionType = 'focus'
  private endTimestamp: number | null = null
  private remainingMs = 0
  private totalMs = 0
  private completedCount = 0
  private endedType: SessionType | null = null

  private readonly now: () => number
  private cfg: EngineConfig
  private listeners = {
    state: new Set<(state: TimerState) => void>(),
    alarm: new Set<(state: TimerState, endedType: SessionType) => void>()
  }

  constructor(cfg: EngineConfig, now: () => number = Date.now) {
    this.cfg = cfg
    this.now = now
    this.totalMs = this.durationMs('focus')
    this.remainingMs = this.totalMs
  }

  // ---- subscription -------------------------------------------------------
  /** `state` fires on every change; `alarm` fires when a session ends (endedType set). */
  on(evt: 'state', cb: (state: TimerState) => void): () => void
  on(evt: 'alarm', cb: (state: TimerState, endedType: SessionType) => void): () => void
  on(evt: EngineEvent, cb: any): () => void {
    this.listeners[evt].add(cb)
    return () => {
      this.listeners[evt].delete(cb)
    }
  }

  private emitState() {
    const s = this.getState()
    for (const cb of this.listeners.state) cb(s)
  }

  private emitAlarm(endedType: SessionType) {
    const s = this.getState()
    for (const cb of this.listeners.alarm) cb(s, endedType)
  }

  // ---- config -------------------------------------------------------------
  updateConfig(cfg: EngineConfig) {
    this.cfg = cfg
    // If idle, reflect any new focus duration immediately in the display.
    if (this.status === 'idle') {
      this.totalMs = this.durationMs('focus')
      this.remainingMs = this.totalMs
      this.emitState()
    }
  }

  private durationMs(type: SessionType): number {
    switch (type) {
      case 'focus':
        return this.cfg.focusMinutes * MIN
      case 'shortBreak':
        return this.cfg.shortBreakMinutes * MIN
      case 'longBreak':
        return this.cfg.longBreakMinutes * MIN
    }
  }

  // ---- snapshot -----------------------------------------------------------
  getState(): TimerState {
    // Freshly derive remaining while running so callers always see truth.
    let remainingMs = this.remainingMs
    if (this.status === 'running' && this.endTimestamp !== null) {
      remainingMs = Math.max(0, this.endTimestamp - this.now())
    }
    return {
      status: this.status,
      sessionType: this.sessionType,
      endTimestamp: this.endTimestamp,
      remainingMs,
      totalMs: this.totalMs,
      completedCount: this.completedCount,
      endedType: this.endedType
    }
  }

  // ---- the six controls ---------------------------------------------------

  /** Start a fresh FOCUS session from idle at the configured duration. */
  start(): void {
    if (this.status !== 'idle') return
    this.beginSession('focus')
  }

  /** Freeze remaining time. Disallowed once remaining is 0. */
  pause(): void {
    if (this.status !== 'running' || this.endTimestamp === null) return
    const remaining = Math.max(0, this.endTimestamp - this.now())
    if (remaining <= 0) return // spec: pause disallowed at 0
    this.remainingMs = remaining
    this.endTimestamp = null
    this.status = 'paused'
    this.emitState()
  }

  /** Continue from paused remaining — recompute endTimestamp, never reuse a stale one. */
  resume(): void {
    if (this.status !== 'paused') return
    this.endTimestamp = this.now() + this.remainingMs
    this.status = 'running'
    this.emitState()
  }

  /** Reset the CURRENT session to its full configured duration, same session type. */
  restart(): void {
    if (this.status === 'idle') return
    this.beginSession(this.sessionType)
  }

  /** End current session WITHOUT marking complete; back to idle. Counter untouched. */
  cancel(): void {
    if (this.status === 'idle') return
    this.status = 'idle'
    this.sessionType = 'focus'
    this.endTimestamp = null
    this.endedType = null
    this.totalMs = this.durationMs('focus')
    this.remainingMs = this.totalMs
    this.emitState()
  }

  /** Extend by the configured increment. Works while running or paused, breaks included. */
  addTime(): void {
    const inc = this.cfg.addTimeMinutes * MIN
    if (this.status === 'running' && this.endTimestamp !== null) {
      this.endTimestamp += inc
      this.totalMs += inc
      this.emitState()
    } else if (this.status === 'paused') {
      this.remainingMs += inc
      this.totalMs += inc
      this.emitState()
    }
    // Ignored when idle/finished — nothing to extend.
  }

  // ---- time progression & transitions ------------------------------------

  /**
   * Called by the main process on a short interval (and on power-resume). Detects a
   * running session that has reached zero — including time that elapsed while the OS
   * was asleep — and moves it to `finished`, requesting the alarm. Idempotent.
   */
  tick(): void {
    if (this.status === 'running' && this.endTimestamp !== null && this.now() >= this.endTimestamp) {
      this.finish()
    }
  }

  private finish(): void {
    const ended = this.sessionType
    this.status = 'finished'
    this.endedType = ended
    this.endTimestamp = null
    this.remainingMs = 0
    if (ended === 'focus') this.completedCount += 1
    this.emitState()
    this.emitAlarm(ended)
  }

  /**
   * User acknowledged the alarm. Only now do we auto-advance to the next session and
   * start it running (spec §7: never advance while the alarm is unacknowledged).
   */
  dismiss(): void {
    if (this.status !== 'finished' || this.endedType === null) return
    const ended = this.endedType
    if (ended === 'focus') {
      // A completed focus session leads to a break: long one every N sessions.
      const isLong = this.completedCount > 0 && this.completedCount % this.cfg.sessionsBeforeLongBreak === 0
      this.beginSession(isLong ? 'longBreak' : 'shortBreak')
    } else {
      // A break leads back to focus. Ending a long break starts a new cycle.
      if (ended === 'longBreak') this.completedCount = 0
      this.beginSession('focus')
    }
  }

  private beginSession(type: SessionType): void {
    this.sessionType = type
    this.totalMs = this.durationMs(type)
    this.remainingMs = this.totalMs
    this.endTimestamp = this.now() + this.totalMs
    this.status = 'running'
    this.endedType = null
    this.emitState()
  }
}
