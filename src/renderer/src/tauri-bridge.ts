import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ControlCommand, TimerState, Config, AlarmPayload } from '../../shared/types'
import type { FocusTimerApi } from './env.d.ts'

const api: FocusTimerApi = {
  control: (cmd: ControlCommand) => {
    invoke('timer_control', { cmd }).catch(console.error)
  },
  dismissAlarm: () => {
    invoke('timer_dismiss_alarm').catch(console.error)
  },
  getState: (): Promise<TimerState> => {
    return invoke<TimerState>('timer_get_state')
  },
  getConfig: (): Promise<Config> => {
    return invoke<Config>('config_get')
  },
  setConfig: async (patch: Partial<Config>): Promise<Config> => {
    const current = await invoke<Config>('config_get')
    const merged = { ...current, ...patch }
    // Ensure nested structures like floatBounds are properly merged
    if (patch.floatBounds && current.floatBounds) {
      merged.floatBounds = { ...current.floatBounds, ...patch.floatBounds }
    }
    return invoke<Config>('config_set', { patch: merged })
  },
  getCustomAudio: async (): Promise<ArrayBuffer | null> => {
    const bytes = await invoke<number[] | null>('audio_get_custom')
    if (!bytes) return null
    const uint8 = new Uint8Array(bytes)
    return uint8.buffer
  },
  openFloat: () => {
    invoke('window_open_float').catch(console.error)
  },
  openMain: () => {
    invoke('window_open_main').catch(console.error)
  },
  onState: (cb: (s: TimerState) => void) => {
    let active = true
    let unlistenFn: (() => void) | null = null

    listen<TimerState>('timer:stateChanged', (event) => {
      if (active) cb(event.payload)
    }).then((unsub) => {
      unlistenFn = unsub
      if (!active) unsub()
    })

    return () => {
      active = false
      if (unlistenFn) unlistenFn()
    }
  },
  onConfig: (cb: (c: Config) => void) => {
    let active = true
    let unlistenFn: (() => void) | null = null

    listen<Config>('config:changed', (event) => {
      if (active) cb(event.payload)
    }).then((unsub) => {
      unlistenFn = unsub
      if (!active) unsub()
    })

    return () => {
      active = false
      if (unlistenFn) unlistenFn()
    }
  },
  onAlarm: (cb: (p: AlarmPayload) => void) => {
    let active = true
    let unlistenFn: (() => void) | null = null

    // Set up standard Web Notification permission check on first alarm
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(console.error)
    }

    listen<AlarmPayload>('timer:playAlarm', (event) => {
      const p = event.payload
      if (!active) return

      // Silent Web Notification corresponding to the native toast notification
      if (Notification.permission === 'granted') {
        const copy = {
          focus: { title: 'Focus session complete', body: 'Nice work — time for a break.' },
          shortBreak: { title: 'Short break over', body: 'Back to focus when you are ready.' },
          longBreak: { title: 'Long break over', body: 'Ready for the next cycle.' }
        }
        const { title, body } = copy[p.endedType]
        try {
          new Notification(title, { body, silent: true })
        } catch (e) {
          console.error('Failed to show notification:', e)
        }
      }

      cb(p)
    }).then((unsub) => {
      unlistenFn = unsub
      if (!active) unsub()
    })

    return () => {
      active = false
      if (unlistenFn) unlistenFn()
    }
  }
}

// Inject the API into the global window object
window.focusTimer = api
