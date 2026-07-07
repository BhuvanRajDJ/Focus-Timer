# Focus Timer — Technical Architecture & Developer Documentation

Focus Timer is a high-fidelity, production-grade Pomodoro desktop application for Windows 11 engineered with **Tauri v2**, **React**, and **TypeScript**. 

It is designed to be highly reliable, lightweight, and visual, featuring a main configuration/planning window and a frameless, always-on-top, draggable floating mini-window (PiP mode) designed to scale down beautifully.

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Rust Core Engine (`TimerEngine`)](#2-rust-core-engine-timerengine)
3. [Window Management & Window-Thread Safety](#3-window-management--window-thread-safety)
4. [Tauri IPC Bridge (`tauri-bridge.ts`)](#4-tauri-ipc-bridge-tauri-bridgets)
5. [React Frontend & requestAnimationFrame Interpolation](#5-react-frontend--requestanimationframe-interpolation)
6. [Web Audio API Synthesized Alarms](#6-web-audio-api-synthesized-alarms)
7. [Database & Configuration Management](#7-database--configuration-management)
8. [System Tray & Single Instance Integration](#8-system-tray--single-instance-integration)
9. [UI Component Guide](#9-ui-component-guide)
10. [Developer Command Reference](#10-developer-command-reference)

---

## 1. System Architecture Overview

The Focus Timer architecture enforces a strict **unidirectional state flow** with a single source of truth in the main Rust process, preventing any visual sync drift between the main planning window and the floating mini-window.

```
+------------------------------------------------------------+
|                       RUST MAIN PROCESS                    |
|                                                            |
|  +---------------------+        +-----------------------+  |
|  |     TimerEngine     |        |   Background Ticker   |  |
|  | (Pure State Machine)|<-------|      Loop (250ms)     |  |
|  +---------------------+        +-----------------------+  |
|             |                               |              |
|             v (Mutates)                     | (Ticks/Alarm)|
|     +---------------+                       v              |
|     |  State/Config |               (Global Broadcast)     |
|     +---------------+               "timer:stateChanged"   |
|       |           |                 "timer:playAlarm"      |
|       v           v                         |              |
+-------|-----------|-------------------------|--------------+
        |           |                         |
        | IPC       | IPC                     | Event Broadcast
        v           v                         v
+-----------------------+         +-----------------------+
|      MAIN WINDOW      |         |    FLOATING WINDOW    |
|      (index.html)     |         |     (float.html)      |
|                       |         |                       |
|  React Render (10fps) |         |  React Render (10fps) |
|  - Progress Ring      |         |  - Tiny indicator     |
|  - Settings & Stats   |         |  - Draggable region   |
|  - Web Audio Synth    |         |  - Web Audio Synth    |
+-----------------------+         +-----------------------+
```

### Architectural Key Properties
* **Single Source of Truth in Rust:** The actual timer logic, states, and transition mechanisms are written in Rust. The user interface windows are thin rendering layers. When a user clicks a button, a Tauri command is sent to the Rust core, mutating the state machine, which then broadcasts the updated state to all open windows.
* **Drift-Corrected Tick Engine:** To completely bypass JS event loop throttling or OS thread pauses, remaining time is derived dynamically on the fly based on the absolute system clock timestamp:
  $$\text{remaining\_ms} = \text{end\_timestamp} - \text{current\_time}$$
* **Sleep/Wake Resilience:** Background ticks check the system clock every 250ms. If the OS was put to sleep and wakes up later, the engine immediately catches up, transitions the state, and fires the alarms.
* **Sub-1% CPU Webview Loop:** The frontends interpolate the remaining milliseconds via `requestAnimationFrame` but throttle React re-renders to ~10fps (bucketed into 100ms blocks), preserving battery and CPU resources for always-on-top widgets.
* **Synthesized Audio:** Built-in alarm tones are generated dynamically via the Web Audio API in whichever window is currently active, eliminating bulky asset sizes and ensuring full compatibility with Windows Volume Mixer.

---

## 2. Rust Core Engine (`TimerEngine`)

The heart of the application is the `TimerEngine` located at `src-tauri/src/engine.rs`. It manages state transitions and represents a headless Pomodoro state machine.

### State Modeling
```rust
pub enum SessionType {
    Focus,
    ShortBreak,
    LongBreak,
}

pub enum TimerStatus {
    Idle,
    Running,
    Paused,
    Finished,
}

pub struct TimerState {
    pub status: TimerStatus,
    pub sessionType: SessionType,
    pub endTimestamp: Option<u64>,
    pub remainingMs: u64,
    pub totalMs: u64,
    pub completedCount: u32,
    pub endedType: Option<SessionType>,
}
```

### Pomodoro Sequence Rules
1. **Focus Sessions:** Standard focus block (default: 25 minutes).
2. **Break Determination:** When a Focus session completes, the engine increments `completedCount`.
   - If `completedCount` reaches the defined threshold `sessions_before_long_break` (default: 4), the engine triggers a **Long Break** (default: 15 minutes) and resets `completedCount` to 0.
   - Otherwise, the engine triggers a **Short Break** (default: 5 minutes).
3. **Acknowledgment Gate:** When a session runs to 0, the status transitions to `Finished`, and the alarm sounds. The engine remains gated in the `Finished` state and **will not automatically advance** to the next session. This ensures that the user is present and acknowledges the transition by calling `dismiss()`.
4. **Transition to Running:** Upon calling `dismiss()`, the engine automatically initiates the next designated session (`Focus` or `Break`) in the `Running` state.

### Core Command Methods
* `start()`: Initiates a new session, sets `end_timestamp = now + total_ms`, and enters `Running`.
* `pause()`: Computes and freezes `remaining_ms = end_timestamp - now`, clears `end_timestamp`, and sets status to `Paused`.
* `resume()`: Re-calculates `end_timestamp = now + remaining_ms` and enters `Running`.
* `restart()`: Re-initializes the current session type with its full duration.
* `cancel()`: Aborts the current cycle, resets completed counts, and reverts to `Idle` on `Focus` session.
* `add_time()`: Appends a designated duration (default: 5 minutes) to the current running or paused session, updating timestamps dynamically.

---

## 3. Window Management & Window-Thread Safety

Focus Timer supports switching seamlessly between a **Main Window** (full view) and a **Floating Window** (compact, always-on-top PiP tracker) via `src-tauri/src/windows.rs`.

### WebView2 Windows Main-Thread Safeties
Building or switching Tauri windows from synchronous command handler threads on Windows can lead to **deadlocks** inside the WebView2 runtime because WebView2 expects window creation strictly on the platform's UI thread (the main thread).
To prevent this, Focus Timer explicitly schedules window creation using Tauri's main-thread dispatcher:

```rust
// In main.rs: window_open_float
app.run_on_main_thread(move || {
    if let Err(e) = create_float_window(&app_for_thread) {
        eprintln!("Failed to create float window: {}", e);
        return;
    }
    close_main_window(&app_for_thread);
})
```

### Floating Window Properties & Safety Precautions
The floating window is a specialized layout designed to stay out of the user's way while remaining accessible:
* **Frameless:** `decorations(false)` and `transparent(true)` provide a clean widget look.
* **Layout Size:** Locked strictly to `150x42` pixels.
* **Persistent:** `always_on_top(true)` and `skip_taskbar(true)` keep the widget overlaying other active work windows.
* **Reentrant Safety on Blur:** On Windows, webviews may occasionally lose their absolute "always-on-top" priority during system focus shifts. To re-assert this priority, the app listens to `WindowEvent::Focused(false)` (blur) and updates `always_on_top(true)`. Because calling `set_always_on_top` synchronously inside a focus-change callback triggers re-entrant Windows messaging loops and can freeze the thread, this operation is queued for the next main-thread tick:
  ```rust
  win.on_window_event(move |event| {
      if let tauri::WindowEvent::Focused(false) = event {
          let win_for_thread = win_clone.clone();
          let _ = app_clone.run_on_main_thread(move || {
              let _ = win_for_thread.set_always_on_top(true);
          });
      }
  });
  ```
* **Coordinates & Monitor Boundaries Safety:** The window's coordinates (X and Y position) are saved to user configuration upon closure. When re-opened, if the saved position is off-screen (e.g. if an external monitor was disconnected), the window detects this by mapping coordinates against active monitors. If off-screen, it repositions itself to the top-right corner of the primary screen:
  ```rust
  // Check if position is within any available monitor bounds
  if !on_screen {
      if let Ok(Some(m)) = win.primary_monitor() {
          let pos = m.position();
          let size = m.size();
          let target_x = pos.x + (size.width as i32) - 200;
          let target_y = pos.y + 100;
          let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(target_x, target_y)));
      }
  }
  ```

---

## 4. Tauri IPC Bridge (`tauri-bridge.ts`)

The React frontend accesses Tauri's backend capabilities via a unified bridge injected into the global window scope (`window.focusTimer`) defined in `src/renderer/src/tauri-bridge.ts`.

### Interface Signature
```typescript
export interface FocusTimerApi {
  control(cmd: ControlCommand): void;
  dismissAlarm(): void;
  getState(): Promise<TimerState>;
  getConfig(): Promise<Config>;
  setConfig(patch: Partial<Config>): Promise<Config>;
  getCustomAudio(): Promise<ArrayBuffer | null>;
  openFloat(): void;
  openMain(): void;
  onState(cb: (s: TimerState) => void): () => void;
  onConfig(cb: (c: Config) => void): () => void;
  onAlarm(cb: (p: AlarmPayload) => void): () => void;
}
```

### Event Mapping & HTML Web Notifications
When the alarm triggers (`onAlarm`), the bridge listens to the `timer:playAlarm` IPC event. It requests permission for system notifications if not already granted. It then displays an OS-level silent Web Notification informing the user that the session has concluded:

* **Focus ended:** *"Focus session complete. Nice work — time for a break."*
* **Short break ended:** *"Short break over. Back to focus when you are ready."*
* **Long break ended:** *"Long break over. Ready for the next cycle."*

Using `silent: true` prevents conflicts with the app's customized synthesized sound waves.

---

## 5. React Frontend & requestAnimationFrame Interpolation

The client-side React timer state is managed in the `useTimer` hook (`src/renderer/src/hooks/useTimer.ts`).

### The Double-Loop Strategy
To keep CPU usage extremely low (crucial for always-on background widgets), the app separates State Transitions from Clock Tick Rendering.

1. **Authoritative State Transitions (Slow Loop):** React subscribes to the Tauri main process. A React state update only triggers when the state machine undergoes a real transition (e.g., `Running -> Paused`, or `Focus -> Break`).
2. **Smooth Tick Rendering (Fast Loop):** When the state status is `'running'`, a local `requestAnimationFrame` loop computes the current remaining time by calculating:
   $$\text{remainingMs} = \text{endTimestamp} - \text{Date.now()}$$

### Ticker Render Throttling (~10fps)
Instead of updating the React state on every frame (which would trigger ~60 React re-renders per second, spiking CPU usage to 5-10%), `useTimer` buckets the remaining time into **100ms intervals**. React state is only committed if the 100ms interval changes:

```typescript
const loop = () => {
  const s = stateRef.current;
  let rem = s.remainingMs;
  if (s.status === 'running' && s.endTimestamp !== null) {
    rem = Math.max(0, s.endTimestamp - Date.now());
  }
  
  // Throttle: Divide by 100ms to group ticks into 10fps buckets
  const bucket = Math.floor(rem / 100);
  if (bucket !== lastBucket.current) {
    lastBucket.current = bucket;
    setRemainingMs(rem);
  }
  
  raf = requestAnimationFrame(loop);
};
```
This reduces rendering and layout calculations dramatically, maintaining CPU consumption **well under 1%** on typical Windows devices.

---

## 6. Web Audio API Synthesized Alarms

Alarms are generated entirely on-the-fly using the Web Audio API (`src/renderer/src/alarm/synth.ts`). This avoids storing bulky WAV or MP3 files in the bundle, respects system-level volume controls, and bypasses licensing issues.

```
+--------------------------------------------------------------+
|                         Web Audio API                        |
|                                                              |
|                     +---------------------+                  |
|                     |  Oscillator Nodes   |                  |
|                     | (Sine/Square waves) |                  |
|                     +---------------------+                  |
|                                |                             |
|                                v                             |
|                     +---------------------+                  |
|                     |   Gain Node (0.28)  |                  |
|                     | (Envelope shaping)  |                  |
|                     +---------------------+                  |
|                                |                             |
|                                v                             |
|                     +---------------------+                  |
|                     |  Master Gain (0.3)  |                  |
|                     +---------------------+                  |
|                                |                             |
|                                v                             |
|                     +---------------------+                  |
|                     |   Audio Destination |                  |
|                     +---------------------+                  |
+--------------------------------------------------------------+
```

### Alarm Tones & Synthesis Patterns
The synthesizer schedules notes using a **Percussive Envelope** (instantaneous rise, exponential volume decay):

* **Chime (`chime`):** Two sine wave oscillators (880Hz and 1318.5Hz) fired in sequence (180ms delay), producing a clean, modern harmonic sound. Repeats every 1.6 seconds.
* **Beep (`beep`):** Three sharp square wave pulses at 1000Hz (spaced 220ms apart) to mimic standard digital timers. Repeats every 1.4 seconds.
* **Marimba (`marimba`):** Three sweet sine notes (587.3Hz, 880Hz, 1174.7Hz) forming a warm major chord. Repeats every 1.5 seconds.
* **Steady Ascent (`steadyAscent`):** A beautiful ambient audio file (`A_Steady_Ascent.mp3`). The raw binary is read from the Tauri resources folder, sent over IPC as a chunked array, decoded inside the Web Audio context via `decodeAudioData`, and looped seamlessly.

### Exponential Envelope Shaping
```typescript
function scheduleNote(ctx: AudioContext, master: GainNode, n: Note, at: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = n.type;
  osc.frequency.value = n.freq;
  
  // Fast attack, exponential decay envelope
  const peak = n.gain ?? 0.28;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.dur);
  
  osc.connect(g).connect(master);
  osc.start(at);
  osc.stop(at + n.dur + 0.02);
}
```

---

## 7. Database & Configuration Management

### Local SQLite Database (`db.rs`)
Focus Timer logs completed focus blocks in a local database file named `focus_timer.db` located in the application's secure app-data folder.

```sql
CREATE TABLE IF NOT EXISTS completed_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_type TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    completed_at TEXT NOT NULL  -- ISO 8601 RFC3339 format
);
```
Sessions are logged asynchronously via the main thread-tick loop in Rust as soon as a `Focus` session transitions to `Finished`. This provides a clean offline audit trail for productivity metrics.

### Configuration File (`config.json`)
Preferences are saved into a formatted `config.json` inside the platform's secure application data folder.

```json
{
  "focusMinutes": 25,
  "shortBreakMinutes": 5,
  "longBreakMinutes": 15,
  "sessionsBeforeLongBreak": 4,
  "addTimeMinutes": 5,
  "focusEndSound": "chime",
  "breakEndSound": "marimba",
  "muteFocusEnd": false,
  "muteBreakEnd": false,
  "reopenInLastMode": true,
  "lastMode": "full",
  "floatBounds": {
    "x": 1240,
    "y": 80,
    "width": 150,
    "height": 42
  }
}
```

### Validation & Sanitization Gate
To prevent file corruptions, manual user edits, or corrupted IPC inputs from crashing the Rust engine, the configuration module runs a rigid **sanitization clamp** on loaded and saved configs:

* `focusMinutes`, `shortBreakMinutes`, `longBreakMinutes`: Clamped between `1` and `180`.
* `sessionsBeforeLongBreak`: Clamped between `2` and `8`.
* `addTimeMinutes`: Clamped between `1` and `60`.
* `lastMode`: Normalizes strictly to `"full"` or `"float"`.

---

## 8. System Tray & Single Instance Integration

Focus Timer features a native Windows System Tray construction (`src-tauri/src/tray.rs`) and enforces a single active application instance to prevent conflicting clock timers.

### Single Instance Policy
Using the `tauri-plugin-single-instance` plugin, if a user attempts to launch a second instance of the application:
1. The secondary startup process terminates immediately.
2. The active instance intercepts the startup arguments, brings the existing window to the foreground, focuses it, and flashes visual attention:
   ```rust
   // In main.rs:
   if let Some(win) = app.get_webview_window("main") {
       let _ = win.show();
       let _ = win.set_focus();
   } else if let Some(win) = app.get_webview_window("float") {
       let _ = win.show();
       let _ = win.set_focus();
   }
   ```

### Native Tray Construction
* **Left-click Action:** Triggers a quick restoration of the Main Window immediately.
* **Context Menu:**
  * **Open timer:** Shows/creates the main window, hiding the floating widget.
  * **Floating mini-window:** Shows/creates the floating window, hiding the main window.
  * **Quit:** Exits the application and saves all current states.
* **Tray Icon Resource:** Loads `resources/tray.png` dynamically with an automatic fallback to the default window icon.

---

## 9. UI Component Guide

The interface utilizes Fluent Design-inspired CSS and high-fidelity React controls:

### `ProgressRing.tsx`
Focus Timer’s signature graphic is a circular vector progress ring (`<svg>`) whose arc shrinks as remaining time declines.
* **Calculations:** Uses standard SVG `strokeDasharray` and `strokeDashoffset` based on the mathematical circumference:
  $$c = 2 \pi r$$
* **Rotation:** Transformed with `rotate(-90deg)` so the progress arc begins exactly at the top (12 o'clock).
* **Adaptability:** Renders at `236px` in the main dashboard and dynamically adjusts colors based on the session's duration (green for focus, amber/red for nearing completion).

### Floating Mini-Window UI (`FloatApp.tsx`)
The compact tracker features zero window borders and has specific interactivity:
* **Draggable Window:** Container is flagged with the HTML attribute `data-tauri-drag-region` alongside CSS `WebkitAppRegion: drag` to allow dragging the mini-window across screens.
* **Hover Interaction:** When the cursor hovers over the tiny bar:
  * Control options (Pause/Start/Resume, Dismiss/Restart, Open Main Window) slide and fade into view (`opacity: 1`, `transform: translateX(0)`).
  * Control buttons are styled with `WebkitAppRegion: no-drag` so mouse clicks interact with the buttons rather than triggering drag movements.
  * When not hovered, the controls hide completely, rendering a highly polished, zero-distraction layout showing only a small colored status dot (representing the session state) and the countdown.

---

## 10. Developer Command Reference

Below is a cheat sheet of the available automation commands:

| Command | Action | Impact |
|:---|:---|:---|
| **`npm run dev`** | Runs `tauri dev` | Launches the hot-reload Tauri window dev environment. |
| **`npm run dev:frontend`** | Runs `vite` | Runs only the web frontend hot server in the browser. |
| **`npm run build`** | Runs `vite build` | Compiles and optimizes assets into `/dist` output directory. |
| **`npm run typecheck`** | Runs `tsc --noEmit` | Validates strict TypeScript compilation and exports. |
| **`npm run clean`** | Runs `node scripts/clean.js` | Removes old build artifacts and deprecated Electron assets. |
| **`npx tauri build`** | Triggers production build | Creates optimized Windows `.exe` installers in target folders. |
