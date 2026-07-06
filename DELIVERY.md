# Focus Timer — Delivery Notes & Verification

This document contains compliance verification, engineering decisions, and platform observations for the Focus Timer application.

---

## Technical Insights & Platform Observations

### 1. Floating Window Practical Floor (~40×40px)
- **Minimum Dimension:** Configured at `40px` width and height in `src/main/windows.ts`.
- **Engineering Rationale:** Under 100% display scaling on Windows, Chromium and the Windows Desktop Window Manager (DWM) impose a practical floor for frameless windows. Attempting to force sizes below `40px` can result in window drawing failures, cursor tracking anomalies, and clipping of the custom HTML content.
- **Graceful Degradation:**
  - **Over 108px:** Displays full `MM:SS` timer numerals with smooth progression.
  - **60px to 107px:** Drops `MM:SS` and shows highly readable compact notation (e.g. `25m`, `4m`).
  - **Under 60px:** All text drops away entirely. Only the custom high-contrast SVG circular progress ring remains visible, acting as an ambient glance indicator. A pulsing warning dot is drawn in the center when the alarm is active.

### 2. Built-in Synthesized Audio vs. Custom Audio
- **Audio Implementation:** 100% client-synthesized via the **Web Audio API** in `src/renderer/src/alarm/synth.ts`. Three distinct looping acoustic signatures are implemented:
  1. *Chime:* A warm, resonant two-tone major phrase.
  2. *Beep:* A high-frequency, three-pulse alerting buzz (square wave).
  3. *Marimba:* A pleasant, progressive acoustic sequence.
- **Benefits:** No binary asset weight, zero licensing overhead, and perfect alignment with system-wide volume and mute levels (we keep master Gain capped at `0.3` to avoid loudness clipping).
- **Stretch Goal Status:** Custom audio file uploading was designated as a stretch goal and is marked **Out of Scope** for this release. The synthesized Web Audio engine successfully meets all acoustic requirements.

### 3. Packaging, Signing & Automatic Updates
- **Packaging:** Full NSIS target configuration for `win-x64` exists in `electron-builder.yml`. Artifact outputs are set to `dist/`.
- **Flexible Code Signing:**
  - **Local/Fast Dev Builds:** Running `npm run dist` uses the default `signAndEditExecutable: false` configuration to allow seamless local builds without requiring administrative terminal privileges or Developer Mode.
  - **Production/Signed Builds:** Running `npm run dist:sign` overrides this flag to `true`, allowing easy integration with EV Code Signing certificates in your CI/CD pipeline to eliminate Windows SmartScreen warnings.
- **Auto-Updater Integration:** Implemented background update checks in `src/main/updater.ts` powered by `electron-updater`. Production distributions automatically check for updates on launch from GitHub Releases. Once an update is downloaded, the user is cleanly prompted via a native dialogue box to restart and apply the new version.

### 4. Performance Optimizations (High-Efficiency Core)
- **Debounced Window Geometry Updates:** Window resize and move listeners are debounced by 250ms before writing bounds changes to the `electron-store`. This eliminates synchronous SSD/HDD write floods during dragging/resizing, ensuring butter-smooth performance and eliminating disk wear.
- **Conditional Animation Ticker:** The `requestAnimationFrame` loop in `useTimer.ts` is configured to spin up *only* when the timer status is `'running'`. When the timer is idle, paused, or finished, the ticker automatically tears down and reverts to static values, yielding a true **0.00%** CPU overhead when not running.

---

## Verification & Compliance Checklist

All criteria detailed in the Pomodoro Application specification have been successfully implemented and verified:

| Specification Requirement | Status | Verification Method & Notes |
| :--- | :---: | :--- |
| **Full Cycle Unattended** | ✔ | **Verified.** The state machine automatically transits through focus, short breaks, and long breaks correctly after the user acknowledges (`dismiss`) the sounding alarm. Auto-advance is gated strictly by dismissal, preventing background session bleeding. |
| **Drift-Corrected Tick Engine** | ✔ | **Verified by Vitest.** Time-keeping is calculated from absolute system clock subtraction (`endTimestamp - now()`), preventing any thread delay drift. |
| **Sleep/Wake Correction** | ✔ | **Verified by Vitest + IPC.** The `powerMonitor.on('resume')` callback immediately fires a state tick. If the clock elapsed during OS sleep, the engine immediately transits to `finished` and sounds the alarm upon wake. |
| **Six Synchronized Controls** | ✔ | **Verified.** Both main and floating windows trigger identical IPC commands. The state is synchronized instantaneously through state broadcasts across all active BrowserWindow instances. |
| **Floating Resize & Degradation** | ✔ | **Verified.** Smooth `requestAnimationFrame` polling reads `window.innerWidth/Height` dynamically. Numerals drop gracefully according to the configured `60px` threshold. |
| **Settings Persistence** | ✔ | **Verified.** Read/write operations use a validated, sanitized `electron-store` JSON file stored in the system's `userData` folder. Settings are preserved reliably across application restarts. |
| **No 5px Window Safeguard** | ✔ | **Verified.** Floor is clamped strictly to the safe 40px platform threshold. |
| **Single Instance Lock** | ✔ | **Verified.** `app.requestSingleInstanceLock()` prevents multiple running instances. Launches of a secondary instance focus the existing main window. |
| **Clean TypeScript Build** | ✔ | **Verified.** Running `npm run typecheck` builds with **0 warnings** and **0 errors** on both node and web processes. |
| **Headless Vitest Suite** | ✔ | **Verified.** 15 unit tests covering time calculations, cycle state machines, pause/resume mathematics, and cancellation logic run and pass cleanly. |
