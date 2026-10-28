# Reload4U — Claude Code context

Chrome extension (Manifest V3) that auto-reloads selected tabs at per-tab intervals.
Repo: https://github.com/akshay-kh/reload4u · Current version: 1.0.0

## Stack
- Plain JavaScript (no framework), Tailwind CSS 3, Vite 5 build
- `npm run dev` → `vite build --watch`; `npm run build` → production build into `dist/`
- Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked
- Tests: `npm test` → Vitest unit tests (`tests/unit/`, run `background.js`/`theme.js` against an
  in-memory `chrome.*` fake in `chrome-mock.js`); `npm run test:e2e` → builds, then Playwright loads
  `dist/` into headless Chromium (`tests/e2e/`). CI runs both on every PR (`.github/workflows/test.yml`).
- Releases: pushing a `v*` tag triggers `.github/workflows/release.yml` (builds + zips `dist/`)

## Layout
```
src/background.js   MV3 service worker — owns ALL reload scheduling
src/popup.html/.js  Toolbar popup: add/remove/pause tabs, per-tab interval, countdown
src/settings.html/.js  Options page: default interval
src/theme.js        Shared theme applier (imported by popup + settings): toggles `dark` on <html>
src/style.css       Tailwind entry (darkMode: 'class')
public/manifest.json  Copied to dist/ as-is (publicDir)
vite.config.ts      root = src, outDir = ../dist, entries: popup, settings, background, style
```

## Storage model
- `chrome.storage.sync`:
  - `selectedTabsWithIntervals`: `{ [tabId: string]: { interval: number /* seconds */, paused: boolean,
    stopAfter?: {type:'count', limit:number} | {type:'title'} | {type:'content'}, stoppedReason?: string } }`
    (legacy format `{ [tabId]: number }` is migrated on read — keep that migration)
  - `reload4uSettings`: `{ defaultInterval: number /* seconds */, theme?: 'system'|'light'|'dark' }`
    (missing `theme` = `'system'`; settings.js must write both fields together — it replaces the object)
- `chrome.storage.session`:
  - `reloadTab_<tabId>`: `{ startedAt: number, ms: number }` — written once when a sub-30s timer
    starts, so the popup can compute the countdown. Never write per tick.
  - `reload4u_progress_<tabId>`: `{ count: number }` — reload counter, tracked for every active
    tab regardless of `stopAfter` (the popup always shows it). Incremented once per successful
    reload; lives in `session` (no write-rate quota) specifically so it CAN be written every
    reload, unlike `sync`.
  - `reload4u_title_<tabId>`: `{ baseline: string }` — captured tab title for `stopAfter.type === 'title'`.
  - `reload4u_content_<tabId>`: `{ hash: number }` — one-way hash of the tab's visible text for
    `stopAfter.type === 'content'`. Computed entirely inside the page via
    `chrome.scripting.executeScript`; only the hash crosses back into the extension, never raw
    content. Re-checked once the tab reaches `status === 'complete'` after each reload.
  - The `title`/`content` keys are mutually exclusive per tab and reset (re-armed) only on a
    brand-new tab, a resume from pause, or an edited `stopAfter` — never on a worker-restart
    rebuild (`hydrateTimers()` passes `resetCondition: false` so in-progress state survives a
    killed service worker). The `progress` key follows the same reset rule.
- Intervals are stored in **seconds** (changed from an earlier minutes-based model in the
  "support interval in min and sec units" work). UI may offer a minutes toggle and converts
  to/from seconds for storage. Background converts seconds → minutes only at the
  `chrome.alarms` boundary (`periodInMinutes: interval / 60`).
- Toolbar badge (`chrome.action.setBadgeText`) shows the count of currently-active (non-paused)
  watched tabs; updated in `updateBadge()` alongside every `storage.onChanged` reaction and on
  worker hydrate. No new permission — `action` was already declared.

## Conventions
- Tab IDs are strings as storage keys; `parseInt` only when calling `chrome.tabs.*`.
- Alarm names: `reloadTab_<tabId>`; keepalive alarm: `reload4u_keepalive`.
- Dark mode: every color utility needs a `dark:` counterpart (incl. classNames built in popup.js).
  `theme.js` mirrors the choice to `localStorage` only as a sync anti-flash cache; sync storage is the source of truth.
- No inline JS in HTML (extension CSP). Use `addEventListener`.
- Match the existing code style (function expressions, callbacks/Promises, 4-space indent).
- No new permissions or network access without asking — check `PRIVACY_POLICY.md` is updated to
  disclose any new one (as of 0.6.0: `scripting` + `host_permissions: ["<all_urls>"]`, used only
  for the content-change stop condition's in-page hashing — see `captureContentHash()`).
- Keep `CHANGELOG.md` updated for user-visible changes; bump version in BOTH
  `package.json` and `public/manifest.json`.

## Cross-browser notes (Chrome vs Firefox)
- `chrome.alarms` 30s floor (`periodInMinutes: 0.5`) only applies from **Chrome 120+**; before
  that the floor was 1 minute. `manifest.json`'s `minimum_chrome_version` must stay >= "120" or
  alarm-based tabs (interval >= 30s) would silently run at a coarser cadence than configured.
- `chrome.storage.session` is only available from **Firefox 115+**; the whole sub-30s/stop-
  condition architecture depends on it unconditionally, so `strict_min_version` must stay >= 115.
- The `background: {service_worker, scripts}` dual-declaration (both fields present, for Chrome
  vs Firefox's event-page model) only resolves correctly together from **Firefox 121+**.
- Firefox MV3 `host_permissions` (used by the content-change stop condition) aren't reliably
  granted/displayed at install until **Firefox 127+**. `strict_min_version` is set to "127.0" to
  cover all three Firefox constraints above with one floor.
- Firefox's `chrome.alarms` floor for MV3 is 1 minute (vs Chrome's 30s). `background.js` detects
  Firefox (`IS_FIREFOX`, via the `moz-extension://` URL scheme) and raises `TIMER_THRESHOLD` to 60s
  there, so 30–59s tabs use the `setInterval` path instead of a clamped alarm. The keepalive alarm
  is also clamped to 60s on Firefox, so a killed worker can take up to a minute to rebuild timers.

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
