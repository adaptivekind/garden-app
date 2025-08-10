const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow;
let gardenProcess;

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
    const gardenPath = process.env.HOME + '/projects/things';
    
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

app.whenReady().then(() => {
  createWindow();
  
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
    gardenProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (gardenProcess) {
    gardenProcess.kill();
  }
});