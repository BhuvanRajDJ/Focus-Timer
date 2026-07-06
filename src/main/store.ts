import Store from 'electron-store'
import { DEFAULT_CONFIG, type Config } from '../shared/types'

/** Persisted, bounded settings under app.getPath('userData')/config.json. */
const store = new Store<{ config: Config }>({
  defaults: { config: DEFAULT_CONFIG }
})

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

/** Merge + validate partial updates so bad input can never corrupt persisted state. */
function sanitize(input: Partial<Config>, base: Config): Config {
  return {
    focusMinutes: clampInt(input.focusMinutes ?? base.focusMinutes, 1, 180, DEFAULT_CONFIG.focusMinutes),
    shortBreakMinutes: clampInt(
      input.shortBreakMinutes ?? base.shortBreakMinutes,
      1,
      180,
      DEFAULT_CONFIG.shortBreakMinutes
    ),
    longBreakMinutes: clampInt(input.longBreakMinutes ?? base.longBreakMinutes, 1, 180, DEFAULT_CONFIG.longBreakMinutes),
    sessionsBeforeLongBreak: clampInt(
      input.sessionsBeforeLongBreak ?? base.sessionsBeforeLongBreak,
      2,
      8,
      DEFAULT_CONFIG.sessionsBeforeLongBreak
    ),
    addTimeMinutes: clampInt(input.addTimeMinutes ?? base.addTimeMinutes, 1, 60, DEFAULT_CONFIG.addTimeMinutes),
    focusEndSound: input.focusEndSound ?? base.focusEndSound,
    breakEndSound: input.breakEndSound ?? base.breakEndSound,
    muteFocusEnd: input.muteFocusEnd ?? base.muteFocusEnd,
    muteBreakEnd: input.muteBreakEnd ?? base.muteBreakEnd,
    reopenInLastMode: input.reopenInLastMode ?? base.reopenInLastMode,
    lastMode: input.lastMode ?? base.lastMode,
    floatBounds: {
      x: input.floatBounds?.x ?? base.floatBounds.x,
      y: input.floatBounds?.y ?? base.floatBounds.y,
      // 40px is the practical platform floor (see DELIVERY.md); never persist smaller.
      width: clampInt(input.floatBounds?.width ?? base.floatBounds.width, 40, 400, DEFAULT_CONFIG.floatBounds.width),
      height: clampInt(input.floatBounds?.height ?? base.floatBounds.height, 40, 400, DEFAULT_CONFIG.floatBounds.height)
    }
  }
}

export function getConfig(): Config {
  return sanitize(store.get('config'), DEFAULT_CONFIG)
}

/** Apply a partial update, returning the sanitized, fully-merged config. */
export function setConfig(patch: Partial<Config>): Config {
  const merged = sanitize(patch, getConfig())
  store.set('config', merged)
  return merged
}
