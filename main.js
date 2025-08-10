const { app, BrowserWindow, shell, Tray, Menu, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

let mainWindow;
let gardenProcess;
let tray;
let currentGardenPath = process.env.HOME + '/projects/things';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false
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
    
    gardenProcess = spawn('garden', ['-p', '8888'], {
      cwd: gardenPath,
      stdio: 'inherit'
    });

    gardenProcess.on('error', (error) => {
      console.error('Failed to start garden:', error);
      reject(error);
    });

    gardenProcess.on('exit', (code) => {
      console.log(`Garden process exited with code ${code}`);
    });

    checkPort(8888, (isOpen) => {
      if (isOpen) {
        resolve();
      } else {
        setTimeout(() => checkPort(8888, (isOpen) => {
          if (isOpen) resolve();
          else reject(new Error('Garden server did not start'));
        }), 2000);
      }
    });
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
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Configure Directory',
      click: configureDirectory
    },
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
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
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
  tray.setToolTip('Garden App');
  
  tray.on('click', configureDirectory);
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
    
    // Update tray menu to show new directory
    createTray();
    
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
  createWindow();
  createTray();
  
  startGarden().then(() => {
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:8888');
    }, 1000);
  }).catch((error) => {
    console.error('Error starting garden:', error);
    mainWindow.loadFile('error.html');
  });

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