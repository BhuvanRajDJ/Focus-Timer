import { describe, it, expect, beforeEach } from 'vitest'
import { TimerEngine } from '../src/main/engine/TimerEngine'
import type { Config } from '../src/shared/types'

const CFG: Pick<
  Config,
  'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'sessionsBeforeLongBreak' | 'addTimeMinutes'
> = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  addTimeMinutes: 5
}

const MIN = 60_000

/** Controllable clock so tests can jump time (including simulating OS sleep). */
class Clock {
  t = 1_000_000
  now = () => this.t
  advance(ms: number) {
    this.t += ms
  }
}

describe('TimerEngine', () => {
  let clock: Clock
  let e: TimerEngine

  beforeEach(() => {
    clock = new Clock()
    e = new TimerEngine(CFG, clock.now)
  })

  it('starts idle showing the full focus duration', () => {
    const s = e.getState()
    expect(s.status).toBe('idle')
    expect(s.sessionType).toBe('focus')
    expect(s.remainingMs).toBe(25 * MIN)
    expect(s.completedCount).toBe(0)
  })

  it('start begins a running focus session', () => {
    e.start()
    const s = e.getState()
    expect(s.status).toBe('running')
    expect(s.sessionType).toBe('focus')
    expect(s.endTimestamp).toBe(clock.t + 25 * MIN)
  })

  it('derives remaining from the clock (drift-free)', () => {
    e.start()
    clock.advance(10 * MIN)
    expect(e.getState().remainingMs).toBe(15 * MIN)
  })

  it('pause freezes remaining; resume recomputes endTimestamp fresh', () => {
    e.start()
    clock.advance(10 * MIN)
    e.pause()
    expect(e.getState().status).toBe('paused')
    expect(e.getState().remainingMs).toBe(15 * MIN)

    // Wall clock moves a lot while paused — must NOT affect remaining.
    clock.advance(60 * MIN)
    expect(e.getState().remainingMs).toBe(15 * MIN)

    e.resume()
    expect(e.getState().status).toBe('running')
    expect(e.getState().endTimestamp).toBe(clock.t + 15 * MIN)
  })

  it('pause is disallowed once remaining is 0', () => {
    e.start()
    clock.advance(25 * MIN)
    e.pause()
    // Still running (pause refused), tick will finish it.
    expect(e.getState().status).toBe('running')
  })

  it('restart resets the current session to full duration, same type', () => {
    e.start()
    clock.advance(20 * MIN)
    e.restart()
    const s = e.getState()
    expect(s.sessionType).toBe('focus')
    expect(s.remainingMs).toBe(25 * MIN)
    expect(s.endTimestamp).toBe(clock.t + 25 * MIN)
  })

  it('cancel returns to idle without incrementing the counter', () => {
    e.start()
    clock.advance(5 * MIN)
    e.cancel()
    const s = e.getState()
    expect(s.status).toBe('idle')
    expect(s.completedCount).toBe(0)
    expect(s.endedType).toBeNull()
  })

  it('addTime extends a running session', () => {
    e.start()
    clock.advance(5 * MIN)
    e.addTime()
    // 20 left + 5 added = 25.
    expect(e.getState().remainingMs).toBe(25 * MIN)
  })

  it('addTime extends a paused session and works during breaks', () => {
    e.start()
    clock.advance(5 * MIN)
    e.pause()
    e.addTime()
    expect(e.getState().remainingMs).toBe(25 * MIN)
  })

  it('finishes exactly at zero and enters finished (no auto-advance)', () => {
    e.start()
    clock.advance(25 * MIN)
    e.tick()
    const s = e.getState()
    expect(s.status).toBe('finished')
    expect(s.endedType).toBe('focus')
    expect(s.completedCount).toBe(1)
  })

  it('SLEEP/WAKE: a session that elapsed during sleep finishes on the next tick', () => {
    e.start()
    // OS sleeps for hours; no ticks fire. Then wake far past endTimestamp.
    clock.advance(5 * 60 * MIN)
    e.tick()
    const s = e.getState()
    expect(s.status).toBe('finished')
    expect(s.remainingMs).toBe(0)
    expect(s.endedType).toBe('focus')
  })

  it('does not auto-advance while the alarm is unacknowledged', () => {
    e.start()
    clock.advance(25 * MIN)
    e.tick()
    clock.advance(10 * MIN)
    e.tick() // extra ticks must not advance past finished
    expect(e.getState().status).toBe('finished')
  })

  it('dismiss after focus starts a short break, then focus again', () => {
    e.start()
    clock.advance(25 * MIN)
    e.tick()
    e.dismiss()
    expect(e.getState().sessionType).toBe('shortBreak')
    expect(e.getState().status).toBe('running')

    clock.advance(5 * MIN)
    e.tick()
    e.dismiss()
    expect(e.getState().sessionType).toBe('focus')
  })

  it('fires alarm event with the ended session type', () => {
    const fired: string[] = []
    e.on('alarm', (_s, endedType) => fired.push(endedType))
    e.start()
    clock.advance(25 * MIN)
    e.tick()
    expect(fired).toEqual(['focus'])
  })

  it('FULL CYCLE: long break after N focus sessions, then counter resets', () => {
    const runFocus = () => {
      // From idle or after a dismissed break, `start` only works from idle; use dismiss chain.
      clock.advance(25 * MIN)
      e.tick()
      e.dismiss()
    }
    // Session 1
    e.start()
    clock.advance(25 * MIN)
    e.tick()
    expect(e.getState().completedCount).toBe(1)
    e.dismiss() // -> shortBreak
    expect(e.getState().sessionType).toBe('shortBreak')
    clock.advance(5 * MIN)
    e.tick()
    e.dismiss() // -> focus

    // Sessions 2 and 3
    for (let i = 2; i <= 3; i++) {
      runFocus() // completes focus i -> break
      expect(e.getState().sessionType).toBe('shortBreak')
      clock.advance(5 * MIN)
      e.tick()
      e.dismiss()
    }

    // Session 4 completes -> should be a LONG break
    clock.advance(25 * MIN)
    e.tick()
    expect(e.getState().completedCount).toBe(4)
    e.dismiss()
    expect(e.getState().sessionType).toBe('longBreak')

    // Dismiss long break -> back to focus and counter resets to 0
    clock.advance(15 * MIN)
    e.tick()
    e.dismiss()
    expect(e.getState().sessionType).toBe('focus')
    expect(e.getState().completedCount).toBe(0)
  })
})
