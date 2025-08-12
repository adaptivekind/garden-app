const { app, BrowserWindow, shell, Tray, Menu, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const os = require('os');

let mainWindow;
let gardenProcess;
let tray;
let currentGardenPath = process.env.HOME + '/projects/things';
let recentDirectories = [];

// Persistent storage path for recent directories
const userDataPath = app.getPath('userData');
const recentDirsFile = path.join(userDataPath, 'recent-directories.json');

function loadRecentDirectories() {
  try {
    if (fs.existsSync(recentDirsFile)) {
      const data = fs.readFileSync(recentDirsFile, 'utf8');
      const parsed = JSON.parse(data);
      // Filter out directories that no longer exist
      recentDirectories = parsed.filter(dir => fs.existsSync(dir));
      console.log('Loaded recent directories:', recentDirectories);
    }
  } catch (error) {
    console.error('Error loading recent directories:', error);
    recentDirectories = [];
  }
}

function saveRecentDirectories() {
  try {
    // Ensure the userData directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(recentDirsFile, JSON.stringify(recentDirectories, null, 2));
    console.log('Saved recent directories:', recentDirectories);
  } catch (error) {
    console.error('Error saving recent directories:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  mainWindow.loadFile('loading.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function startGarden() {
  return new Promise((resolve, reject) => {
    const gardenPath = currentGardenPath;
    
    // Check if directory exists
    if (!fs.existsSync(gardenPath)) {
      reject(new Error(`Directory does not exist: ${gardenPath}`));
      return;
    }
    
    gardenProcess = spawn('garden', ['-p', '8888'], {
      cwd: gardenPath,
      stdio: 'pipe',
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin' }
    });

    let stderr = '';
    gardenProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gardenProcess.on('error', (error) => {
      console.error('Failed to start garden:', error);
      console.error('PATH:', process.env.PATH);
      console.error('Working directory:', gardenPath);
      if (error.code === 'ENOENT') {
        reject(new Error('Garden command not found. Please install @adaptivekind/garden globally: npm install -g @adaptivekind/garden'));
      } else {
        reject(error);
      }
    });

    gardenProcess.on('exit', (code) => {
      console.log(`Garden process exited with code ${code}`);
      if (code !== 0 && stderr) {
        console.error('Garden stderr:', stderr);
      }
    });

    // Give garden a moment to start before checking port
    setTimeout(() => {
      checkPort(8888, (isOpen) => {
        if (isOpen) {
          resolve();
        } else {
          setTimeout(() => checkPort(8888, (isOpen) => {
            if (isOpen) resolve();
            else reject(new Error(`Garden server did not start in directory: ${gardenPath}\n\nPlease ensure:\n1. 'garden' command is installed\n2. Directory contains a valid garden project\n3. Port 8888 is available`));
          }), 3000);
        }
      });
    }, 1000);
  });
}

function checkPort(port, callback) {
  const socket = new net.Socket();
  
  socket.setTimeout(1000);
  
  socket.on('connect', () => {
    socket.destroy();
    callback(true);
  });
  
  socket.on('timeout', () => {
    socket.destroy();
    callback(false);
  });
  
  socket.on('error', () => {
    callback(false);
  });
  
  socket.connect(port, 'localhost');
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'menu-icon.png'));
  tray.setToolTip('Garden App');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  updateTrayMenu();
}

function addToRecentDirectories(dirPath) {
  // Remove if already exists
  recentDirectories = recentDirectories.filter(dir => dir !== dirPath);
  
  // Add to beginning
  recentDirectories.unshift(dirPath);
  
  // Keep only last 5
  if (recentDirectories.length > 5) {
    recentDirectories = recentDirectories.slice(0, 5);
  }
  
  // Save to persistent storage
  saveRecentDirectories();
}

function switchToDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    currentGardenPath = dirPath;
    addToRecentDirectories(dirPath);
    updateTrayMenu();
    restartGarden();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  
  // Build recent directories submenu
  const recentDirsMenu = recentDirectories.map(dir => ({
    label: path.basename(dir),
    sublabel: dir,
    click: () => switchToDirectory(dir)
  }));
  
  if (recentDirsMenu.length === 0) {
    recentDirsMenu.push({
      label: 'No recent directories',
      enabled: false
    });
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Configure Directory',
      click: configureDirectory
    },
    {
      label: 'Recent Directories',
      submenu: recentDirsMenu
    },
    { type: 'separator' },
    {
      label: 'Current Directory',
      sublabel: currentGardenPath,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Restart Garden',
      click: restartGarden
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (gardenProcess) {
          gardenProcess.kill('SIGTERM');
          setTimeout(() => {
            if (gardenProcess && !gardenProcess.killed) {
              gardenProcess.kill('SIGKILL');
            }
          }, 1000);
        }
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

async function configureDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Garden Directory',
    defaultPath: currentGardenPath
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    currentGardenPath = newPath;
    
    // Add to recent directories
    addToRecentDirectories(newPath);
    
    // Update tray menu to show new directory
    updateTrayMenu();
    
    // Restart garden with new directory
    restartGarden();
  }
}

function restartGarden() {
  if (gardenProcess) {
    gardenProcess.kill();
  }
  
  mainWindow.loadFile('loading.html');
  
  startGarden().then(() => {
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:8888');
    }, 1000);
  }).catch((error) => {
    console.error('Error starting garden:', error);
    mainWindow.loadFile('error.html');
  });
}

app.whenReady().then(() => {
  // Load recent directories from persistent storage
  loadRecentDirectories();
  
  createWindow();
  createTray();
  
  // Check if default directory exists, if not, prompt user to configure
  if (!fs.existsSync(currentGardenPath)) {
    mainWindow.loadFile('error.html');
    // Show directory configuration dialog after a brief delay
    setTimeout(() => {
      configureDirectory();
    }, 2000);
  } else {
    startGarden().then(() => {
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:8888');
      }, 1000);
    }).catch((error) => {
      console.error('Error starting garden:', error);
      mainWindow.loadFile('error.html');
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (gardenProcess) {
    gardenProcess.kill('SIGTERM');
    setTimeout(() => {
      if (gardenProcess && !gardenProcess.killed) {
        gardenProcess.kill('SIGKILL');
      }
    }, 2000);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (gardenProcess) {
    gardenProcess.kill('SIGTERM');
    setTimeout(() => {
      if (gardenProcess && !gardenProcess.killed) {
        gardenProcess.kill('SIGKILL');
      }
    }, 2000);
  }
});

// IPC handlers
ipcMain.handle('restart-garden', async () => {
  return new Promise((resolve) => {
    restartGarden();
    resolve(true);
  });
});

ipcMain.handle('configure-directory', async () => {
  await configureDirectory();
  return true;
});