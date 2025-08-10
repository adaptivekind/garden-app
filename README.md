# Garden App

An Electron application that runs Garden development server and provides an integrated browser interface for local development.

## Quick Start

```bash
npm install
npm start
```

The application will automatically start the Garden server from `~/projects/things` on port 8888 and open it in an embedded browser window.

## Installation

### Prerequisites

- Node.js and npm installed
- Garden CLI tool installed and available in PATH
- A Garden project located at `~/projects/things`

### Setup

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Starting the Application

Run the application using:

```bash
npm start
```

### What Happens

1. The app displays a loading screen
2. Executes `garden -p 8888` from the `~/projects/things` directory
3. Waits for the Garden server to become available on localhost:8888
4. Opens the Garden interface in an embedded browser window

### Error Handling

If Garden fails to start, the app displays an error page with retry options. Common issues:

- Garden CLI not installed or not in PATH
- `~/projects/things` directory doesn't exist
- Port 8888 already in use

### Closing the Application

When you close the Electron window, the Garden server process is automatically terminated.

## Development

### Project Structure

- `main.js` - Main Electron process, handles Garden server lifecycle
- `loading.html` - Loading screen displayed during startup
- `error.html` - Error page for startup failures
- `package.json` - Project configuration and dependencies

### Key Features

- Automatic Garden server process management
- Port availability checking before loading the browser
- Process cleanup on application exit
- Error handling with user-friendly messages
- External link handling (opens in default browser)

### Modifying Garden Configuration

To change the Garden server port or working directory, edit the relevant values in `main.js`:

```javascript
const gardenPath = process.env.HOME + '/projects/things'; // Working directory
gardenProcess = spawn('garden', ['-p', '8888'], {          // Port configuration
```
