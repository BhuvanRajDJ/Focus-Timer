/// <reference types="vite/client" />
import type { ControlCommand, TimerState, Config, AlarmPayload } from '../../shared/types'

// Mirror of the preload contextBridge surface (src/preload/index.ts).
export interface FocusTimerApi {
  control(cmd: ControlCommand): void
  dismissAlarm(): void
  getState(): Promise<TimerState>
  getConfig(): Promise<Config>
  setConfig(patch: Partial<Config>): Promise<Config>
  getCustomAudio(): Promise<ArrayBuffer | null>
  openFloat(): void
  openMain(): void
  onState(cb: (s: TimerState) => void): () => void
  onConfig(cb: (c: Config) => void): () => void
  onAlarm(cb: (p: AlarmPayload) => void): () => void
}

declare global {
  interface Window {
    focusTimer: FocusTimerApi
  }
}

// Electron frameless-window drag regions aren't in csstype.
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}
