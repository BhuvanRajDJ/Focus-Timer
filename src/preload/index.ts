import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ControlCommand, type TimerState, type Config, type AlarmPayload } from '../shared/types'

/** Typed, minimal surface exposed to the renderer. No direct ipcRenderer access. */
const api = {
  // controls
  control: (cmd: ControlCommand) => ipcRenderer.send(IPC.control, cmd),
  dismissAlarm: () => ipcRenderer.send(IPC.dismissAlarm),
  getState: (): Promise<TimerState> => ipcRenderer.invoke(IPC.getState),

  // config
  getConfig: (): Promise<Config> => ipcRenderer.invoke(IPC.getConfig),
  setConfig: (patch: Partial<Config>): Promise<Config> => ipcRenderer.invoke(IPC.setConfig, patch),
  getCustomAudio: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke(IPC.getCustomAudio),

  // window mode
  openFloat: () => ipcRenderer.send(IPC.openFloat),
  openMain: () => ipcRenderer.send(IPC.openMain),

  // subscriptions — return an unsubscribe fn
  onState: (cb: (s: TimerState) => void) => {
    const h = (_e: unknown, s: TimerState) => cb(s)
    ipcRenderer.on(IPC.stateChanged, h)
    return () => ipcRenderer.removeListener(IPC.stateChanged, h)
  },
  onConfig: (cb: (c: Config) => void) => {
    const h = (_e: unknown, c: Config) => cb(c)
    ipcRenderer.on(IPC.configChanged, h)
    return () => ipcRenderer.removeListener(IPC.configChanged, h)
  },
  onAlarm: (cb: (p: AlarmPayload) => void) => {
    const h = (_e: unknown, p: AlarmPayload) => cb(p)
    ipcRenderer.on(IPC.playAlarm, h)
    return () => ipcRenderer.removeListener(IPC.playAlarm, h)
  }
}

export type FocusTimerApi = typeof api

contextBridge.exposeInMainWorld('focusTimer', api)
