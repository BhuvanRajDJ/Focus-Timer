import { app, Tray, Menu, nativeImage, dialog } from 'electron'
import { join } from 'node:path'
import { setupIpc } from './ipc'
import { getConfig } from './store'
import { createMainWindow, createFloatWindow, getMainWindow } from './windows'
import { initUpdater } from './updater'

// Handle fatal startup errors gracefully
function handleStartupError(title: string, error: unknown) {
  const stack = error instanceof Error ? error.stack : String(error)
  console.error(`${title}:`, error)
  try {
    dialog.showErrorBox(
      'Focus Timer - Startup Error',
      `${title}\n\nA fatal error occurred during application startup:\n\n${stack || error}`
    )
  } catch (e) {
    console.error('Failed to show error dialog:', e)
  }
  app.quit()
}

// Catch unhandled exceptions at the top level
process.on('uncaughtException', (error) => {
  handleStartupError('Uncaught Exception', error)
})

process.on('unhandledRejection', (reason) => {
  handleStartupError('Unhandled Rejection', reason)
})

// Windows toast notifications need a stable AppUserModelId to attribute correctly.
app.setAppUserModelId('com.focustimer.app')

let tray: Tray | null = null

function buildTray() {
  try {
    const iconPath = join(__dirname, '../../resources/tray.png')
    let icon = nativeImage.createFromPath(iconPath)
    
    // Fallback if the icon is empty (i.e. file not found or load failed)
    if (icon.isEmpty()) {
      console.warn(`Tray icon not found at: ${iconPath}. Trying fallback paths.`)
      // Try resolving relative to resourcesPath if packaged
      const fallbackPath = join(process.resourcesPath, 'resources/tray.png')
      icon = nativeImage.createFromPath(fallbackPath)
      
      if (icon.isEmpty()) {
        console.warn(`Fallback tray icon not found at: ${fallbackPath}. Using empty image.`)
        icon = nativeImage.createEmpty()
      }
    }
    
    // On Windows, passing an empty image to new Tray() will cause a native crash (Exception Breakpoint).
    // Skip tray creation if we don't have a valid icon.
    if (icon.isEmpty()) {
      console.error('Tray icon is empty. Skipping tray creation to prevent Windows native crash.')
      return
    }

    tray = new Tray(icon)
    tray.setToolTip('Focus Timer')
    const menu = Menu.buildFromTemplate([
      { label: 'Open timer', click: () => createMainWindow() },
      { label: 'Floating mini-window', click: () => createFloatWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => {
      const w = getMainWindow()
      if (w && !w.isDestroyed()) w.show()
      else createMainWindow()
    })
  } catch (error) {
    console.error('Failed to create tray icon:', error)
    // Do not crash the entire app if just the tray creation fails
  }
}

function openInitialWindow() {
  const cfg = getConfig()
  if (cfg.reopenInLastMode && cfg.lastMode === 'float') {
    createFloatWindow()
  } else {
    createMainWindow()
  }
}

// Single instance — second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    try {
      const w = getMainWindow()
      if (w && !w.isDestroyed()) {
        w.show()
        w.focus()
      } else {
        createMainWindow()
      }
    } catch (e) {
      console.error('Error handling second instance:', e)
    }
  })

  app.whenReady().then(() => {
    try {
      setupIpc()
      initUpdater()
      buildTray()
      openInitialWindow()

      app.on('activate', () => {
        try {
          if (getMainWindow() === null) openInitialWindow()
        } catch (e) {
          handleStartupError('Activate Error', e)
        }
      })
    } catch (e) {
      handleStartupError('App Ready Error', e)
    }
  })

  // Keep running in the tray when all windows are closed (a timer may still be counting).
  app.on('window-all-closed', () => {
    // Intentionally do NOT quit on Windows: the tray keeps the session alive.
  })
}
