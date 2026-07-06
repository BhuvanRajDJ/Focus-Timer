// Shared contract imported by main, preload, and both renderers.
// Keep this free of Electron/Node/DOM imports so the engine stays headless-testable.

export type SessionType = 'focus' | 'shortBreak' | 'longBreak'

export type TimerStatus =
  | 'idle' // nothing running
  | 'running' // counting down
  | 'paused' // frozen, remaining preserved
  | 'finished' // hit zero, alarm sounding, awaiting user dismissal before auto-advance

/** The six controls, identical from both windows. */
export type ControlCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'cancel' }
  | { type: 'addTime' }

export type AlarmSound = 'chime' | 'beep' | 'marimba' | 'steadyAscent'

export interface Config {
  /** Durations in minutes (bounded 1–180). */
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** Completed focus sessions before a long break (bounded 2–8). */
  sessionsBeforeLongBreak: number
  /** Minutes added per "Add time" press. */
  addTimeMinutes: number
  /** Alarm choices + mute, split by which session just ended. */
  focusEndSound: AlarmSound
  breakEndSound: AlarmSound
  muteFocusEnd: boolean
  muteBreakEnd: boolean
  /** Restore floating vs full window on next launch. */
  reopenInLastMode: boolean
  lastMode: 'full' | 'float'
  /** Floating window geometry, restored across restarts. */
  floatBounds: { x: number | null; y: number | null; width: number; height: number }
}

export const DEFAULT_CONFIG: Config = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  addTimeMinutes: 5,
  focusEndSound: 'chime',
  breakEndSound: 'marimba',
  muteFocusEnd: false,
  muteBreakEnd: false,
  reopenInLastMode: true,
  lastMode: 'full',
  floatBounds: { x: null, y: null, width: 150, height: 42 }
}

/**
 * The full timer state broadcast from main to every window. Renderers derive the
 * live `remaining` locally each frame from `endTimestamp` for smooth ticking; this
 * object only changes on a real state transition.
 */
export interface TimerState {
  status: TimerStatus
  sessionType: SessionType
  /** Absolute wall-clock ms when the current running session ends. null unless running. */
  endTimestamp: number | null
  /** Remaining ms captured while paused (or the finished session's full duration). */
  remainingMs: number
  /** Full duration of the current session in ms (for progress ring math). */
  totalMs: number
  /** Completed focus sessions in the current cycle (resets after a long break). */
  completedCount: number
  /** When status==='finished', which session type just ended (drives alarm choice). */
  endedType: SessionType | null
}

/** IPC channel names — single place so main/preload can't drift. */
export const IPC = {
  /** renderer -> main: run a control command. */
  control: 'timer:control',
  /** renderer -> main (invoke): fetch current state on mount. */
  getState: 'timer:getState',
  /** main -> renderer: broadcast new state. */
  stateChanged: 'timer:stateChanged',
  /** main -> renderer: play alarm for the just-ended session. payload: { sound, muted }. */
  playAlarm: 'timer:playAlarm',
  /** renderer -> main: user dismissed the alarm; safe to auto-advance. */
  dismissAlarm: 'timer:dismissAlarm',
  /** custom audio IPC channel */
  getCustomAudio: 'audio:getCustom',
  /** config get/set/subscribe. */
  getConfig: 'config:get',
  setConfig: 'config:set',
  configChanged: 'config:changed',
  /** window management. */
  openFloat: 'window:openFloat',
  openMain: 'window:openMain',
  dragFloat: 'window:dragFloat'
} as const

export interface AlarmPayload {
  sound: AlarmSound
  muted: boolean
  endedType: SessionType
}
