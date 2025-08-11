# Reload 4 U !

A Chrome and Firefox extension that automatically reloads selected tabs at customizable intervals.

## Features

- Auto-reload tabs at specified intervals (default: 2 seconds)
- Visual status indicators with tab badges and countdown timers
- Customizable settings page for default intervals
- Support for multiple tabs with individual controls
- Real-time visual feedback showing reload state (active/paused/stopped)

## Prerequisites

- Node.js (recommended version: 22.18.0)
- npm (comes with Node.js)
- Google Chrome or Mozilla Firefox browser

## Setup and Installation

### 1. Clone the Repository

```bash
git clone https://github.com/akshay-kh/reload4u.git
cd reload4u
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Extension

For development (with file watching):
```bash
npm run dev
```

For production build:
```bash
npm run build
```

This will create a `dist/` folder with the compiled extension files.

### 4. Load Extension in Browser

#### Chrome:
1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `dist/` folder from your project directory

#### Firefox:
1. Open Mozilla Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from your `dist/` folder

## Development

### Project Structure

```
reload4u/
├── src/                 # Source files
│   ├── background.js    # Background service worker
│   ├── popup.html       # Extension popup UI
│   ├── popup.js         # Popup functionality
│   ├── settings.html    # Settings page
│   ├── settings.js      # Settings functionality
│   └── style.css        # Styles
├── public/              # Static assets
│   ├── manifest.json    # Extension manifest
│   └── images/          # Extension icons
├── dist/                # Built extension (generated)
└── package.json         # Dependencies and scripts
```

### Available Scripts

- `npm run dev` - Build with file watching for development
- `npm run build` - Production build

### Making Changes

1. Make your changes in the `src/` directory
2. Run `npm run dev` to build with file watching
3. Reload the extension in your browser:
   - **Chrome**: Go to `chrome://extensions/` and click the refresh icon on your extension
   - **Firefox**: Go to `about:debugging` → "This Firefox" and click "Reload" on your extension
4. Test your changes

## Usage

1. Click the extension icon in the browser toolbar
2. Use the popup interface to:
   - Start/stop auto-reload for the current tab
   - Adjust reload interval
   - View countdown timer and status
3. Access settings through the extension options or popup link
4. Visual indicators show the reload state on each tab

## Permissions

The extension requires the following permissions:
- `activeTab` - Access to the currently active tab
- `storage` - Store user preferences and settings
- `tabs` - Manage tab reloading functionality
- `alarms` - Handle timed reload operations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add new feature'`)
5. Push to the branch (`git push origin feature/new-feature`)
6. Create a Pull Request

## License

ISC License - see the repository for more details.
