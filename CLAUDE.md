# Reload4U — Claude Code context

Chrome extension (Manifest V3) that auto-reloads selected tabs at per-tab intervals.
Repo: https://github.com/akshay-kh/reload4u · Current version: 0.4.0

## Stack
- Plain JavaScript (no framework), Tailwind CSS 3, Vite 5 build
- `npm run dev` → `vite build --watch`; `npm run build` → production build into `dist/`
- Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked
- Releases: pushing a `v*` tag triggers `.github/workflows/release.yml` (builds + zips `dist/`)

## Layout
```
src/background.js   MV3 service worker — owns ALL reload scheduling
src/popup.html/.js  Toolbar popup: add/remove/pause tabs, per-tab interval, countdown
src/settings.html/.js  Options page: default interval
src/style.css       Tailwind entry
public/manifest.json  Copied to dist/ as-is (publicDir)
vite.config.ts      root = src, outDir = ../dist, entries: popup, settings, background, style
```

## Storage model
- `chrome.storage.sync`:
  - `selectedTabsWithIntervals`: `{ [tabId: string]: { interval: number /* seconds */, paused: boolean } }`
    (legacy format `{ [tabId]: number }` is migrated on read — keep that migration)
  - `reload4uSettings`: `{ defaultInterval: number /* seconds */ }`
- `chrome.storage.session`:
  - `reloadTab_<tabId>`: `{ startedAt: number, ms: number }` — written once when a sub-30s timer
    starts, so the popup can compute the countdown. Never write per tick.
- Intervals are stored in **seconds** (changed from an earlier minutes-based model in the
  "support interval in min and sec units" work). UI may offer a minutes toggle and converts
  to/from seconds for storage. Background converts seconds → minutes only at the
  `chrome.alarms` boundary (`periodInMinutes: interval / 60`).

## Conventions
- Tab IDs are strings as storage keys; `parseInt` only when calling `chrome.tabs.*`.
- Alarm names: `reloadTab_<tabId>`; keepalive alarm: `reload4u_keepalive`.
- No inline JS in HTML (extension CSP). Use `addEventListener`.
- Match the existing code style (function expressions, callbacks/Promises, 4-space indent).
- No new permissions or network access without asking — the privacy policy promises none.
- Keep `CHANGELOG.md` updated for user-visible changes; bump version in BOTH
  `package.json` and `public/manifest.json`.

## Hard constraints
- `chrome.alarms` minimum period is 30s (0.5 min). Intervals below that use `setInterval`
  in the service worker instead (down to a 0.5s floor), plus a `reload4u_keepalive` alarm
  (every 30s) to rebuild those timers if the worker is terminated.
- MV3 service workers are terminated when idle; in-memory state (e.g. `setInterval` handles)
  is lost. Anything that must survive goes in storage and is rebuilt on worker startup via
  `hydrateTimers()` — it must only rebuild missing sub-30s timers, never touch alarm-based tabs.
- `chrome.storage.sync` write quota is ~120/min — never write to it on a timer; the background
  is the sole writer-on-schedule and only writes to `storage.session` (not `sync`) when a
  sub-30s timer starts.
