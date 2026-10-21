# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-10-21

### Added
- **Sub-30-second intervals**: Reload intervals can now go as low as 0.5 seconds. `chrome.alarms`
  can't schedule below 30s, so intervals under 30s now run on a `setInterval` timer inside the
  background service worker instead, with a 30s keepalive alarm to rebuild that timer if the
  worker is ever terminated by Chrome.
- **Fast-interval safeguards**: tabs reloading faster than 2s skip a reload if the tab is still
  mid-load; the popup shows a warning for any tab set below 5s.

### Changed
- **Popup & settings interval inputs now use plain seconds** (minimum 0.5, step 0.5) instead of the
  previous seconds/minutes unit dropdown — simpler, and the dropdown had no clean way to express
  fractional sub-second values.
- Interval inputs for added/updated tabs no longer create or clear `chrome.alarms` directly from the
  popup/settings pages; they only write to `storage.sync`, and the background worker is the sole
  owner of scheduling (alarms or timers) in response to storage changes.
- **Smart countdown display**: tabs under 2s show a static "every Xs" label instead of a ticking
  countdown, since the countdown couldn't keep up with sub-second intervals anyway.

### Technical
- **Migration Support**: Automatic detection and handling of the legacy bare-number interval format
  (values < 30 reset to the 30s default, since that long predates sub-30s support)
- **Chrome Alarms API**: Proper conversion from seconds to minutes when creating alarms (interval / 60)
- **manifest.json**: added `minimum_chrome_version: "116"`

### Migration Notes
- Existing per-tab intervals (stored in seconds) load unchanged; only the legacy bare-number format
  (pre-dating per-tab pause support) is normalized, and only reset to 30s if it was below 30.

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