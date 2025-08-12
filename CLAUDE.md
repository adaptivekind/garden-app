# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `npm start` - Compile TypeScript and start the Electron app
- `npm run dev` - Compile TypeScript and start with development flags
- `npm run compile` - Compile TypeScript to JavaScript
- `npm run compile:watch` - Compile TypeScript in watch mode
- `node create-icon.js` - Regenerate app and menu bar icons

### Building and Distribution
- `npm run build:mac` - Compile TypeScript and build macOS app with DMG
- `npm run build:mac-no-dmg` - Compile TypeScript and build macOS app without DMG (faster, directory only)
- `npm run build` - Compile TypeScript and build for all configured platforms
- Built apps are output to `build/` directory
- Compiled TypeScript is output to `dist/` directory

### Testing the App
After making changes, rebuild and test by copying the new `.app` from `build/mac-arm64/Garden.app` to Applications folder.

## Architecture Overview

This is an Electron app that wraps the Garden CLI tool, providing an integrated browser interface for Garden development projects.

### Core Application Flow
1. **Startup**: App creates browser window + system tray icon, checks if default directory (`~/projects/things`) exists
2. **Garden Management**: Spawns `garden -p 8888` subprocess in target directory, monitors port 8888 for availability
3. **UI States**: Shows loading.html → loads localhost:8888 on success → shows error.html on failure
4. **Process Lifecycle**: Manages Garden subprocess start/stop/restart, ensures cleanup on app exit

### Key Components

**src/main.ts** - Main process (TypeScript) containing:
- `createWindow()` - Browser window setup (1200x800, security settings)
- `startGarden()` - Garden subprocess management with comprehensive error handling
- `createTray()` - System tray menu with directory configuration
- `configureDirectory()` - Directory selection dialog
- `restartGarden()` - Process restart logic

**UI Files**:
- `loading.html` - Animated loading screen during Garden startup
- `error.html` - User-friendly error page with troubleshooting steps

**Icon Generation**:
- `create-icon.js` - Generates both app icon (512x512) and menu bar icon (32x32)

**TypeScript Configuration**:
- `src/preload.ts` - Preload script with proper type definitions for IPC
- `tsconfig.json` - TypeScript compiler configuration
- `dist/` - Compiled JavaScript output directory

### State Management
- `currentGardenPath` - Currently configured Garden project directory
- `gardenProcess` - Child process reference for lifecycle management
- `mainWindow` - Browser window reference
- `tray` - System tray reference

### Error Handling Strategy
The app handles multiple failure modes:
- Garden CLI not installed (`ENOENT` error)
- Target directory doesn't exist (fs.existsSync check)
- Garden server fails to start (port checking with timeout)
- Process exit with non-zero code

Error recovery includes automatic directory configuration prompts and clear user instructions.

### Build Configuration
Located in package.json `build` section:
- Multi-architecture support (ARM64 + x64)
- File inclusion rules (excludes unnecessary files)
- macOS app category and icon settings
- DMG configuration for distribution

### Security Settings
- `nodeIntegration: false` - Prevents Node.js access in renderer
- `contextIsolation: true` - Isolates renderer context
- `webSecurity: false` - Allows local development server access
- External links open in system browser via `setWindowOpenHandler`

## Development Guidelines

### Modifying Garden Configuration
Garden server settings are in the `startGarden()` function:
- Default path: `currentGardenPath` variable (initially `~/projects/things`)
- Port: hardcoded to 8888 in spawn arguments
- Process options: `cwd` for directory, `stdio: 'pipe'` for error capture

### Adding New Menu Items
System tray menu is built in `createTray()` using `Menu.buildFromTemplate()`. Menu updates require calling `createTray()` again to refresh.

### Process Management Best Practices
Always use graceful termination (`SIGTERM`) followed by forced kill (`SIGKILL`) after timeout. The app handles this in multiple places: tray quit, window close, and app quit events.

### Icon Updates
After modifying `create-icon.js`, run it and rebuild the app. Icons are embedded during the electron-builder packaging process.