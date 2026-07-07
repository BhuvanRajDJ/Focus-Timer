# Focus Timer — Windows 11 Pomodoro App

Focus Timer is a modern, high-fidelity Pomodoro application engineered with Tauri v2, React, and TypeScript. It features a main window for focus planning and settings, alongside a frameless, always-on-top, draggable floating mini-window (PiP mode) designed to scale down beautifully.

## Architectural Key Properties

- **Single Source of Truth in Rust Main Process:** The Pomodoro timer state engine lives entirely in the Rust **main process** (`src-tauri/src/engine.rs`). The main window and floating mini-window are thin webview layers. Control commands (start, pause, resume, etc.) invoke Tauri commands that mutate the engine, which then broadcasts the updated state to all windows using Tauri's global event emitter (`timer:stateChanged`). This structurally prevents two drifting timers.
- **Drift-Corrected Tick Engine:** Instead of decrementing seconds, the engine stores absolute timestamps and derives the remaining time `remaining = end_timestamp - now()` dynamically on every tick.
- **Sleep/Wake Resilience:** Remaining time calculations self-correct because they are derived from the system clock. A background thread tick interval (250ms) in Rust ensures that if the OS was asleep, the engine immediately transits state and triggers the alarm upon wake.
- **Optimized Webview Performance:** Webviews listen for the broadcast of `{status, endTimestamp}` and run a `requestAnimationFrame` loop that interpolates the live countdown locally. The React re-renders are throttled to ~10fps (bucketed by 100ms) to maintain sub-1% CPU usage for the persistent floating window.
- **Synthesized Web Audio Alarms:** Built-in alarm tones (chime, beep, marimba) are generated dynamically using the Web Audio API in the active webview, respecting the system volume and mute controls.
- **Local SQLite Database:** Completed focus sessions are logged locally to a SQLite database (`db.rs`) for reliable session history tracking.

---

## File Layout

```
focus-timer/
  package.json, tsconfig.json, vite.config.ts  # Frontend configurations
  src/
    shared/types.ts                            # Shared TimerState and Config types
    renderer/
      index.html, float.html                   # Dual entrypoints for main and PiP window
      src/main.tsx, float.tsx                  # Webview entrypoints
      src/App.tsx                              # Main planning window UI with Settings and Stats
      src/FloatApp.tsx                         # Frameless, draggable PiP-mode window
      src/components/
        ProgressRing.tsx                       # Custom vector circular arc progress (green -> amber -> red)
        Controls.tsx                           # Synchronized timer controls
        Settings.tsx                           # Configurations and preferences panel
      src/hooks/
        useTimer.ts                            # Throttled requestAnimationFrame ticker hook
        useAlarm.ts                            # Web Audio API synthesizer
      src/theme.css                            # Fluent-design token palette and styles
  src-tauri/
    Cargo.toml                                 # Rust dependencies configuration
    tauri.conf.json                            # Tauri application configuration
    src/
      main.rs                                  # Application lifecycle, commands, and thread setups
      engine.rs                                # Pure Pomodoro state machine (drift-corrected)
      config.rs                                # User preferences JSON file management
      db.rs                                    # SQLite connection and session logging
      tray.rs                                  # Native Windows System Tray construction
      windows.rs                               # Main & float window spawning and management
    resources/                                 # App icons, tray icon, and static audio resource
  scripts/
    gen-icons.mjs                              # Standalone PNG & ICO encoder script
    clean.js                                   # Clean script for removing deprecated Electron/build outputs
```

---

## Getting Started

### Prerequisites

- **Node.js** (v22 or newer recommended)
- **Rust Compiler** and system tools required by Tauri

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

### Clean Up Deprecated Files

To delete old build outputs and unwanted Electron artifacts from the workspace:

```bash
npm run clean
```

### Production Build & Packaging

1. **Clean workspace:**
   ```bash
   npm run clean
   ```

2. **Verify TypeScript compilation:**
   ```bash
   npm run typecheck
   ```

3. **Build the production executable:**
   ```bash
   npx tauri build
   ```
