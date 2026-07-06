import { ipcMain, BrowserWindow, powerMonitor, app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type ControlCommand, type Config, type AlarmPayload } from '../shared/types'
import { TimerEngine } from './engine/TimerEngine'
import { getConfig, setConfig } from './store'
import { notifySessionEnd } from './notifications'
import { createMainWindow, createFloatWindow, closeFloatWindow, closeMainWindow } from './windows'

/** Send to every open window so main + floating views stay in lockstep. */
function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function setupIpc(): { engine: TimerEngine } {
  const engine = new TimerEngine(getConfig())

  // --- engine -> all windows ------------------------------------------------
  engine.on('state', (state) => broadcast(IPC.stateChanged, state))
  engine.on('alarm', (_state, endedType) => {
    const cfg = getConfig()
    const isFocus = endedType === 'focus'
    const payload: AlarmPayload = {
      sound: isFocus ? cfg.focusEndSound : cfg.breakEndSound,
      muted: isFocus ? cfg.muteFocusEnd : cfg.muteBreakEnd,
      endedType
    }
    broadcast(IPC.playAlarm, payload) // a renderer plays audio (respects system volume)
    notifySessionEnd(endedType) // native toast in parallel
  })

  // --- renderer -> engine ---------------------------------------------------
  ipcMain.handle(IPC.getState, () => engine.getState())
  ipcMain.handle(IPC.getCustomAudio, () => {
    try {
      const filePath = join(__dirname, '../../A_Steady_Ascent.mp3')
      return readFileSync(filePath)
    } catch (error) {
      console.error('Failed to read A_Steady_Ascent.mp3:', error)
      return null
    }
  })

  ipcMain.on(IPC.control, (_e, cmd: ControlCommand) => {
    switch (cmd.type) {
      case 'start':
        return engine.start()
      case 'pause':
        return engine.pause()
      case 'resume':
        return engine.resume()
      case 'restart':
        return engine.restart()
      case 'cancel':
        return engine.cancel()
      case 'addTime':
        return engine.addTime()
    }
  })

  ipcMain.on(IPC.dismissAlarm, () => engine.dismiss())

  // --- config ---------------------------------------------------------------
  ipcMain.handle(IPC.getConfig, () => getConfig())
  ipcMain.handle(IPC.setConfig, (_e, patch: Partial<Config>) => {
    const merged = setConfig(patch)
    engine.updateConfig(merged) // durations/cycle rules take effect for future sessions
    broadcast(IPC.configChanged, merged)
    return merged
  })

  // --- window mode switching ------------------------------------------------
  ipcMain.on(IPC.openFloat, () => {
    setConfig({ lastMode: 'float' })
    createFloatWindow()
    closeMainWindow()
  })
  ipcMain.on(IPC.openMain, () => {
    setConfig({ lastMode: 'full' })
    createMainWindow()
    closeFloatWindow()
  })

  // --- drift-corrected heartbeat -------------------------------------------
  // A short interval only DETECTS completion; it never accumulates time. Combined with
  // the powerMonitor hook this guarantees a session that elapsed during sleep finishes
  // promptly on wake.
  const timer = setInterval(() => engine.tick(), 250)
  const onResume = () => engine.tick()
  powerMonitor.on('resume', onResume)

  app.on('before-quit', () => {
    clearInterval(timer)
    powerMonitor.removeListener('resume', onResume)
  })

  return { engine }
}
