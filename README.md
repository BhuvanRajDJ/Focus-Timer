# Focus Timer — Windows 11 Pomodoro App

Focus Timer is a modern, high-fidelity Pomodoro application engineered with Electron, React, and TypeScript. It features a main window for focus planning and settings, alongside a frameless, always-on-top, draggable floating mini-window (PiP mode) designed to scale down beautifully.

## Architectural Key Properties

- **Single Source of Truth in Main Process:** The Pomodoro timer state engine lives entirely in the Electron **main process**. The main window and floating mini-window are thin views. Control commands (start, pause, resume, etc.) invoke IPC handlers that mutate the engine, which then broadcasts the updated state to all windows. This structurally prevents two drifting timers.
- **Drift-Corrected Tick Engine:** Instead of decrementing seconds, the engine stores an absolute `endTimestamp` and derives the remaining time `remaining = endTimestamp - Date.now()` dynamically on every frame.
- **Sleep/Wake Resilience:** Remaining time calculations self-correct because they are derived from the wall-clock. A main-process check interval (250ms) plus a listener on Electron `powerMonitor`'s `resume` event ensures that a session which finishes while the OS was asleep immediately triggers the alarm on wake.
- **Optimized Renderer Performance:** Renderers listen for the broadcast of `{status, endTimestamp}` and run a `requestAnimationFrame` loop that interpolates the live countdown locally. The React re-renders are throttled to ~10fps (bucketed by 100ms) to maintain sub-1% CPU usage for the persistent floating window.
- **Synthesized Web Audio Alarms:** Built-in alarm tones (chime, beep, marimba) are generated dynamically using the Web Audio API in the active renderer, respecting the system volume and mute controls without licensing baggage.

---

## File Layout

```
focus-timer/
  package.json, tsconfig*.json, electron.vite.config.ts, electron-builder.yml, vitest.config.ts
  src/
    shared/types.ts          # Shared TimerState, Config, and IPC constants
    main/
      index.ts               # App lifecycle, tray construction, single instance lock
      windows.ts             # Main & floating window factory, position restoration
      engine/TimerEngine.ts  # Pure, event-emitting state machine (drift-corrected)
      store.ts               # electron-store configuration and schema sanitization
      ipc.ts                 # Main process IPC routing & heartbeat tick intervals
      notifications.ts       # Native Windows Toast notifications
    preload/index.ts         # Secure, typed contextBridge API
    renderer/
      index.html, float.html # Dual entry-points for electron-vite
      src/main.tsx, float.tsx
      src/App.tsx            # Main planning window UI with Settings and Stats
      src/FloatApp.tsx       # Frameless, draggable PiP-mode window (ring-only under 60px)
      src/components/
        ProgressRing.tsx     # Custom vector circular arc progress (depletes green->amber->red)
        Controls.tsx         # Responsive layout for the six controls (start/pause/resume/restart/cancel/addTime)
        Settings.tsx         # Electron-store configuration panel
        SessionBadge.tsx     # Semantic, accessible session badges (Focus, Short Break, Long Break)
      src/hooks/
        useTimer.ts          # Smooth sub-frame ticker hook using requestAnimationFrame
        useAlarm.ts          # Orchestrates alarm playback and prevents orphaned audio
      src/lib/format.ts      # MM:SS and compact text formatting utilities
      src/theme.css          # Fluent-design token palette and styles
  resources/                 # Self-generated icon.ico, icon.png, and tray.png
  scripts/
    gen-icons.mjs            # Standalone PNG & ICO encoder script (no external dependencies)
  tests/
    engine.test.ts           # Exhaustive unit test suite covering full state machine
```

---

## Getting Started

### Prerequisites

- Node.js (v22 or newer recommended)
- npm (v11 or newer)

### Installation

Clone or copy the directory and run:

```bash
npm install
```

### Development

To run the application in hot-reload development mode:

```bash
npm run dev
```

### Testing

Run the full headless Vitest suite to verify state machine correctness, sleep/wake compliance, pause/resume calculations, and boundary limits:

```bash
npm test
```

### Production Build & Packaging

1. **Typecheck & Linting Verification:**
   ```bash
   npm run typecheck
   ```
2. **Build Production Assets:**
   ```bash
   npm run build
   ```
3. **Generate Installer (Windows NSIS):**
   ```bash
   npm run dist
   ```
   *Note: This packages a Windows x64 executable installer inside the `dist/` directory. Code-signing is omitted, so Windows SmartScreen will display an "Unknown Publisher" warning on first launch.*
# Focus-Timer
