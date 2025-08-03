# Changelog

All notable changes to this project will be documented in this file.

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