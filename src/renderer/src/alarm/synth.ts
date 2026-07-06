import type { AlarmSound } from '../../../shared/types'

/**
 * Built-in alarm tones synthesized with the Web Audio API — no shipped audio binaries,
 * no licensing, and crucially the OS mixer still applies system volume/mute (we never
 * hardcode absolute loudness; gain tops out at a modest 0.3). The tone loops until the
 * user dismisses, matching the spec's "acknowledge before advancing" rule.
 */

export interface AlarmHandle {
  stop(): void
}

type Note = { freq: number; start: number; dur: number; type: OscillatorType; gain?: number }

// Each pattern is one "phrase" that repeats every `period` seconds until stopped.
// Each pattern is one "phrase" that repeats every `period` seconds until stopped.
const PATTERNS: Record<Exclude<AlarmSound, 'steadyAscent'>, { period: number; notes: Note[] }> = {
  chime: {
    period: 1.6,
    notes: [
      { freq: 880, start: 0, dur: 0.5, type: 'sine' },
      { freq: 1318.5, start: 0.18, dur: 0.6, type: 'sine' }
    ]
  },
  beep: {
    period: 1.4,
    notes: [
      { freq: 1000, start: 0, dur: 0.12, type: 'square', gain: 0.18 },
      { freq: 1000, start: 0.22, dur: 0.12, type: 'square', gain: 0.18 },
      { freq: 1000, start: 0.44, dur: 0.12, type: 'square', gain: 0.18 }
    ]
  },
  marimba: {
    period: 1.5,
    notes: [
      { freq: 587.3, start: 0, dur: 0.35, type: 'sine' },
      { freq: 880, start: 0.15, dur: 0.35, type: 'sine' },
      { freq: 1174.7, start: 0.3, dur: 0.4, type: 'sine' }
    ]
  }
}

function scheduleNote(ctx: AudioContext, master: GainNode, n: Note, at: number) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = n.type
  osc.frequency.value = n.freq
  const peak = n.gain ?? 0.28
  // Percussive envelope: fast attack, exponential decay.
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.dur)
  osc.connect(g).connect(master)
  osc.start(at)
  osc.stop(at + n.dur + 0.02)
}

export function playAlarm(sound: AlarmSound): AlarmHandle {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  // Autoplay policy: resume in case the context starts suspended.
  ctx.resume().catch(() => {})

  const master = ctx.createGain()
  master.gain.value = 0.3 // modest; system volume applies on top
  master.connect(ctx.destination)

  let stopped = false
  let interval: number | undefined
  let sourceNode: AudioBufferSourceNode | null = null

  if (sound === 'steadyAscent') {
    window.focusTimer.getCustomAudio().then((buffer) => {
      if (stopped || !buffer) return
      ctx.decodeAudioData(buffer)
        .then((audioBuffer) => {
          if (stopped) return
          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.loop = true // Loop natively
          source.connect(master)
          source.start(0)
          sourceNode = source
        })
        .catch((err) => {
          console.error('Failed to decode audio data:', err)
        })
    }).catch((err) => {
      console.error('Failed to load custom audio:', err)
    })
  } else {
    const pattern = PATTERNS[sound]
    const fireOnce = () => {
      if (stopped) return
      const base = ctx.currentTime + 0.02
      for (const n of pattern.notes) scheduleNote(ctx, master, n, base + n.start)
    }

    fireOnce()
    interval = window.setInterval(fireOnce, pattern.period * 1000)
  }

  return {
    stop() {
      stopped = true
      if (interval !== undefined) {
        clearInterval(interval)
      }
      if (sourceNode) {
        try {
          sourceNode.stop()
        } catch (e) {}
      }
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      setTimeout(() => ctx.close().catch(() => {}), 200)
    }
  }
}
