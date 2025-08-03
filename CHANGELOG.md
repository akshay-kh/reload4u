# Changelog

All notable changes to this project will be documented in this file.

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

### Removed
- **Tab Title Icon Feature**: Removed problematic 🔄 icon injection into browser tab titles
- **Script Injection Logic**: Eliminated all tab title modification code for better stability
- **Unnecessary Permissions**: Removed `scripting` and `host_permissions` for enhanced privacy

### Fixed
- **Performance Issues**: Eliminated script injection overhead and related bugs
- **Permission Conflicts**: Reduced required permissions for better user trust
- **UI Stability**: Removed complex tab title manipulation that caused display issues

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