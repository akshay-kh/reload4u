# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-10-28

### Added
- **Dark, light, and system-default themes.** A new "Appearance" setting on the Settings page
  applies to the popup and the Settings page. "System default" (the default) follows the OS
  light/dark preference and updates live when it changes; changing the theme while the popup is
  open updates it immediately.

### Fixed
- **Firefox: 30–59 second intervals now run at the configured cadence.** Firefox clamps MV3
  `chrome.alarms` to a 1-minute floor (Chrome's is 30s), so these tabs were firing every 60s.
  On Firefox, intervals below 60s now use the in-worker timer path (the same one sub-30s tabs
  use on Chrome) instead of alarms. Chrome behaviour is unchanged. This resolves the known
  limitation noted in 0.6.1.
- **Popup no longer shows duplicate tab cards.** A single action (add, remove, pause/resume,
  editing an interval or stop condition, stop all) could trigger two overlapping popup renders,
  each appending a card per tab. Renders are now guarded so a superseded one is discarded, and
  each storage write triggers only one render.

## [0.6.1] - 2026-10-21

### Fixed
- **Chrome/Firefox minimum-version floors corrected** after a cross-browser compatibility audit:
  - `minimum_chrome_version` bumped from 116 to **120** — Chrome's `chrome.alarms` 30-second floor
    (`periodInMinutes: 0.5`) only took effect in Chrome 120; before that the floor was 1 minute,
    so alarm-based tabs (interval >= 30s) would have silently run at a coarser cadence than
    configured on Chrome 116–119.
  - Firefox `strict_min_version` bumped from 109.0 to **127.0** — `chrome.storage.session`, which
    the whole sub-30s/stop-condition architecture depends on unconditionally, only exists from
    Firefox 115+; the dual `service_worker`/`scripts` background declaration only resolves
    correctly together from Firefox 121+; and `host_permissions` (used by the content-change
    stop condition) aren't reliably granted/displayed at install before Firefox 127.

### Known limitation (documented, not fixed)
- Firefox's `chrome.alarms` floor for MV3 is reportedly 1 minute even on current versions, vs
  Chrome's 30 seconds. An alarm-scheduled tab configured for 30–59s will likely fire every 60s on
  Firefox instead of the configured value. This isn't browser-detected/compensated for yet.

## [0.6.0] - 2026-10-21

### Added
- **Page-content-change stop condition**: a third "Stop when:" option — pauses a tab once its
  page content changes, not just its title. Useful for pages whose title never updates (SPAs,
  dashboards) but whose body content does.

### Changed
- **New permissions**: `scripting` and host permissions (`<all_urls>`) are now requested, used
  only to inject a small content-hashing script into tabs where you've enabled this specific
  condition. No other feature uses these permissions.
- **Privacy policy updated** to disclose this: the injected script computes a one-way hash of a
  tab's visible text *inside the page* and returns only that hash — raw page content is never
  read by, transmitted to, or stored by the extension. The hash cannot be reversed into the
  original text.

### Technical
- `chrome.scripting.executeScript` runs a self-contained function (`hashPageContent`) in the
  target tab; the hash is captured as a baseline when the condition is armed and re-checked once
  the tab finishes loading after each reload (`chrome.tabs.onUpdated`, `status === 'complete'`).
- Injection failures (chrome:// pages, the Web Store, a tab mid-navigation, etc.) are caught and
  ignored — the tab stays watched, that check is just skipped for one cycle.

## [0.5.0] - 2026-10-21

### Added
- **Sub-30-second intervals**: Reload intervals can now go as low as 0.5 seconds. `chrome.alarms`
  can't schedule below 30s, so intervals under 30s now run on a `setInterval` timer inside the
  background service worker instead, with a 30s keepalive alarm to rebuild that timer if the
  worker is ever terminated by Chrome.
- **Fast-interval safeguards**: tabs reloading faster than 2s skip a reload if the tab is still
  mid-load; the popup shows a warning for any tab set below 5s.
- **Stop conditions**: a watched tab can now auto-pause itself after a set number of reloads,
  or as soon as its tab title changes — useful for "reload until this updates" workflows without
  babysitting the popup. Configurable per tab via a new "Stop when:" control.
- **Toolbar badge**: the extension icon now shows a count of currently-active auto-reloading tabs
  (hidden when none are active), so you can tell at a glance without opening the popup.

### Changed
- **Popup & settings interval inputs now use plain seconds** (minimum 0.5, step 0.5) instead of the
  previous seconds/minutes unit dropdown — simpler, and the dropdown had no clean way to express
  fractional sub-second values.
- Interval inputs for added/updated tabs no longer create or clear `chrome.alarms` directly from the
  popup/settings pages; they only write to `storage.sync`, and the background worker is the sole
  owner of scheduling (alarms or timers) in response to storage changes.
- **Smart countdown display**: tabs under 2s show a static "every Xs" label instead of a ticking
  countdown, since the countdown couldn't keep up with sub-second intervals anyway.
- Paused tabs that were auto-stopped by a condition show why (e.g. "Stopped: reached 5 reloads",
  "Stopped: page title changed") instead of a generic "Reload paused" label. Resuming a tab clears
  that reason and restarts its stop-condition progress from zero.

### Technical
- **Migration Support**: Automatic detection and handling of the legacy bare-number interval format
  (values < 30 reset to the 30s default, since that long predates sub-30s support)
- **Chrome Alarms API**: Proper conversion from seconds to minutes when creating alarms (interval / 60)
- **manifest.json**: added `minimum_chrome_version: "116"`
- Reload-count and title-baseline tracking live in `chrome.storage.session` (`reload4u_progress_*`,
  `reload4u_title_*`), not `sync` — session storage has no write-rate quota, so the per-reload
  counter increment is safe there but would not be on `sync`.
- Stop-condition progress survives a killed/restarted service worker (only reset on a new tab,
  a resume, or an edited condition) via a `resetCondition` flag threaded through `startTab()`.
- Considered page-content-change detection as a third stop-condition type; deferred because it
  needs `chrome.scripting` *and* broad host permissions to inject into arbitrary background tabs
  (not just the active one), which is a bigger ask than the current permission set and needs
  explicit sign-off plus a privacy-policy update before adding.

## [0.4.0] - 2025-12-28

### Added
- **Flexible Time Unit Selection**: Users can now choose between seconds and minutes for all interval inputs
- **Unit Selector Dropdown**: Added intuitive unit selector (sec/min) in both settings page and popup
- **Smart Display Format**: Intervals automatically display in the most readable format (e.g., 60 seconds shows as "1 min")
- **Dynamic Input Validation**: Minimum interval hint updates based on selected unit (30 seconds or 0.5 minutes)

### Changed
- **Interval Storage Format**: All intervals now stored internally in seconds (breaking change from previous 0.5-minute system)
- **Improved User Experience**: More intuitive time input with familiar units (seconds/minutes)
- **Settings Page**: Updated with unit selector for default interval configuration
- **Popup Interface**: Enhanced interval controls with unit dropdown for each tab
- **Conversion Logic**: Seamless conversion between user-selected units and internal seconds storage

### Technical
- **Migration Support**: Automatic detection and handling of old interval format (values < 30 reset to default)
- **Chrome Alarms API**: Proper conversion from seconds to minutes when creating alarms (interval / 60)
- **Consistent Validation**: 30-second minimum enforced regardless of user-selected unit
- **Code Organization**: Added conversion helper functions (`convertSecondsToDisplay`, `convertDisplayToSeconds`)

### Migration Notes
- Existing intervals less than 30 seconds will be automatically reset to 30 seconds (default)
- Old format data (0.5, 1, 2 for minutes) will be converted or reset to new format
- All intervals now display intelligently based on their value (60s+ shows in minutes if evenly divisible)

## [0.3.2] - 2025-08-03

### Added
- **Extension Settings Page**: Dedicated settings page accessible via right-click extension icon → Options
- **Centralized Configuration**: Moved default interval setting from popup to settings page for better organization
- **Settings Link in Popup**: Added ⚙️ Settings button in popup for easy access to configuration
- **Future-ready Architecture**: Settings page designed to accommodate additional preferences and options

### Changed
- **Cleaner Popup Interface**: Removed default interval input from popup to focus on core functionality
- **Improved User Experience**: Settings now follow Chrome extension best practices with dedicated options page
- **Enhanced Organization**: Configuration options centralized in one location

### Technical
- **Updated Manifest**: Added `options_page` entry for settings page integration
- **Enhanced Build System**: Updated Vite configuration to include settings page in build process
- **Settings Storage**: Implemented proper settings storage and retrieval system

## [0.3.1] - 2025-08-03

### Added
- **Visual Status Indicators**: Comprehensive status badges, countdown timers, and visual grouping
- **Real-time Countdown Timers**: Live display showing seconds until next reload for active tabs
- **Enhanced Visual Grouping**: Separate sections for active and paused tabs with color-coded themes
- **Status Badges**: Colored indicator dots (green pulsing for active, yellow for paused)
- **Improved Popup Size**: Larger popup window for better content display and usability
- **Professional UI Cards**: Clean card-based design with shadows and better visual hierarchy

### Changed
- **Enhanced Tab Display**: Better organization with clear separation of active vs paused tabs
- **Improved Button Layout**: Better spacing and visual design for pause/resume/remove buttons
- **Countdown Integration**: Real-time timers integrated into each tab card showing time to next reload
- **Visual State Management**: Consistent color-coded indicators throughout the interface

### Fixed
- **UI Performance**: Optimized popup rendering and countdown timer management
- **Visual Consistency**: Improved color scheme and layout consistency across all components

## [0.3.0] - 2025-08-03

### Added
- **Multiple Tab Support**: Select and reload multiple tabs simultaneously with individual controls
- **Customizable Intervals**: Set reload interval for each tab independently (minimum 30 seconds due to Chrome API limits)
- **Pause/Resume Functionality**: Temporarily pause tab reloading without removing tabs from the list
- **Visual State Indicators**: Clear UI feedback showing paused vs active tabs
- **Enhanced UI**: Professional logo display and improved layout with proper event handling

### Changed
- **Storage Structure**: Updated to support interval and pause state per tab
- **Alarm Management**: Individual alarms per tab for better performance and control
- **UI Layout**: Redesigned popup with pause/resume buttons and interval inputs
- **Security**: Replaced inline event handlers with proper event listeners for CSP compliance

### Fixed
- **Content Security Policy**: Removed inline JavaScript to comply with Chrome extension security requirements
- **Type Consistency**: Ensured consistent string handling for tab IDs throughout the codebase

## [0.2.1] - Previous Release
- Basic single tab reload functionality