import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getConfig, setConfig } from './store'

const preload = join(__dirname, '../preload/index.mjs')

/** In dev, electron-vite serves the renderer; in prod we load built HTML files. */
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

function loadRoute(win: BrowserWindow, htmlFile: 'index.html' | 'float.html') {
  if (RENDERER_URL) {
    win.loadURL(`${RENDERER_URL}/${htmlFile}`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${htmlFile}`))
  }
}

let mainWin: BrowserWindow | null = null
let floatWin: BrowserWindow | null = null
let floatBoundsDebounce: NodeJS.Timeout | null = null

export function getMainWindow() {
  return mainWin
}
export function getFloatWindow() {
  return floatWin
}

export function createMainWindow(): BrowserWindow {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show()
    mainWin.focus()
    return mainWin
  }
  mainWin = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 480,
    show: false,
    backgroundColor: '#14161c',
    title: 'Focus Timer',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: false }
  })
  mainWin.on('ready-to-show', () => mainWin?.show())
  mainWin.on('closed', () => {
    mainWin = null
  })
  loadRoute(mainWin, 'index.html')
  return mainWin
}

export function createFloatWindow(): BrowserWindow {
  if (floatWin && !floatWin.isDestroyed()) {
    floatWin.show()
    floatWin.focus()
    return floatWin
  }
  const { floatBounds } = getConfig()
  floatWin = new BrowserWindow({
    width: 150,
    height: 42,
    x: floatBounds.x ?? undefined,
    y: floatBounds.y ?? undefined,
    minWidth: 150,
    minHeight: 42,
    maxWidth: 150,
    maxHeight: 42,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, sandbox: false }
  })
  floatWin.setAlwaysOnTop(true, 'screen-saver')

  // Windows can silently drop always-on-top under some elevated windows — re-assert it.
  floatWin.on('blur', () => {
    if (floatWin && !floatWin.isDestroyed()) floatWin.setAlwaysOnTop(true, 'screen-saver')
  })

  const persistBounds = () => {
    if (floatBoundsDebounce) clearTimeout(floatBoundsDebounce)
    floatBoundsDebounce = setTimeout(() => {
      if (!floatWin || floatWin.isDestroyed()) return
      const b = floatWin.getBounds()
      setConfig({ floatBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
    }, 250)
  }
  floatWin.on('moved', persistBounds)
  floatWin.on('resized', persistBounds)
  floatWin.on('closed', () => {
    if (floatBoundsDebounce) {
      clearTimeout(floatBoundsDebounce)
      floatBoundsDebounce = null
    }
    floatWin = null
  })

  // Keep the restored position on-screen (a monitor may have been unplugged).
  if (floatBounds.x !== null && floatBounds.y !== null) {
    const area = screen.getDisplayMatching(floatWin.getBounds()).workArea
    const x = Math.min(Math.max(floatBounds.x, area.x), area.x + area.width - 150)
    const y = Math.min(Math.max(floatBounds.y, area.y), area.y + area.height - 42)
    floatWin.setPosition(Math.round(x), Math.round(y))
  }

  loadRoute(floatWin, 'float.html')
  return floatWin
}

export function closeFloatWindow() {
  if (floatWin && !floatWin.isDestroyed()) floatWin.close()
}

export function closeMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.close()
}
