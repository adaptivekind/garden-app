import {
  app,
  BrowserWindow,
  shell,
  Tray,
  Menu,
  dialog,
  ipcMain,
} from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as net from "net";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;
let gardenProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let currentGardenPath: string = process.env.HOME + "/projects/things";
console.log("Initial garden path set to:", currentGardenPath);
console.log("Process environment HOME:", process.env.HOME);
console.log("Process cwd:", process.cwd());
console.log("__dirname:", __dirname);
let recentDirectories: string[] = [];

// Persistent storage path for recent directories
const userDataPath: string = app.getPath("userData");
const recentDirsFile: string = path.join(
  userDataPath,
  "recent-directories.json",
);

function loadRecentDirectories(): void {
  try {
    if (fs.existsSync(recentDirsFile)) {
      const data: string = fs.readFileSync(recentDirsFile, "utf8");
      const parsed: string[] = JSON.parse(data);
      // Filter out directories that no longer exist
      recentDirectories = parsed.filter((dir: string) => fs.existsSync(dir));
      console.log("Loaded recent directories:", recentDirectories);
    }
  } catch (error) {
    console.error("Error loading recent directories:", error);
    recentDirectories = [];
  }
}

function saveRecentDirectories(): void {
  try {
    // Ensure the userData directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(
      recentDirsFile,
      JSON.stringify(recentDirectories, null, 2),
    );
    console.log("Saved recent directories:", recentDirectories);
  } catch (error) {
    console.error("Error saving recent directories:", error);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow.loadFile("loading.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    // Small delay to ensure scripts are loaded, then send first status update
    setTimeout(() => {
      sendStatusUpdate("App ready", "Main window loaded");
    }, 100);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function sendStatusUpdate(status: string, details?: string): void {
  console.log(`Status: ${status} | Details: ${details || "none"}`);

  // Force update the loading screen directly
  if (mainWindow && mainWindow.webContents) {
    try {
      // Safely escape strings and execute JavaScript
      const escapedStatus = status.replace(/'/g, "\\'").replace(/\r?\n/g, " ");
      const escapedDetails = (details || "")
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, " ");

      mainWindow.webContents
        .executeJavaScript(
          `
        try {
          if (window.updateStatus) {
            window.updateStatus('${escapedStatus}', '${escapedDetails}');
          } else {
            console.log('updateStatus function not available yet');
          }
        } catch (e) {
          console.error('Error in sendStatusUpdate:', e);
        }
      `,
        )
        .catch((error) => {
          console.error("JavaScript execution failed:", error);
        });
    } catch (error) {
      console.error("Failed to prepare JavaScript:", error);
    }
  }
}

function startGarden(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const gardenPath: string = currentGardenPath;

    sendStatusUpdate(
      `Checking directory : ${gardenPath} ...`,
      `Path: ${gardenPath}`,
    );
    console.log(
      `[${Date.now() - startTime}ms] Checking directory: ${gardenPath}`,
    );

    // Check if directory exists
    if (!fs.existsSync(gardenPath)) {
      reject(new Error(`Directory does not exist: ${gardenPath}`));
      return;
    }

    console.log(
      `[${Date.now() - startTime}ms] Directory exists, spawning garden process`,
    );

    // Quick check if garden command exists
    try {
      const { execSync } = require("child_process");
      console.log(
        `[${Date.now() - startTime}ms] Checking for garden command...`,
      );
      console.log(
        `[${Date.now() - startTime}ms] Current PATH:`,
        process.env.PATH,
      );
      const result = execSync("which garden", { stdio: "pipe", timeout: 2000 });
      console.log(
        `[${Date.now() - startTime}ms] Garden command found at:`,
        result.toString().trim(),
      );
    } catch (error) {
      console.log(
        `[${Date.now() - startTime}ms] Garden command not found in PATH`,
      );
      console.log(`[${Date.now() - startTime}ms] Error:`, error);
      sendStatusUpdate(
        "Garden not found",
        "Install: npm install -g @adaptivekind/garden",
      );
      reject(
        new Error(
          "Garden command not found. Please install: npm install -g @adaptivekind/garden",
        ),
      );
      return;
    }

    sendStatusUpdate("Starting garden ...", "Running: garden -p 8888");

    gardenProcess = spawn("garden", ["-p", "8888"], {
      cwd: gardenPath,
      stdio: "pipe",
      env: { ...process.env, PATH: process.env.PATH + ":/opt/homebrew/bin" },
    });

    console.log(
      `[${Date.now() - startTime}ms] Garden process spawned, PID: ${gardenProcess.pid}`,
    );

    let stderr = "";
    let stdout = "";

    gardenProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      console.log(
        `[${Date.now() - startTime}ms] Garden stderr:`,
        output.trim(),
      );
    });

    gardenProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      console.log(
        `[${Date.now() - startTime}ms] Garden stdout:`,
        output.trim(),
      );
    });

    gardenProcess.on("error", (error: Error & { code?: string }) => {
      console.error("Failed to start garden:", error);
      console.error("PATH:", process.env.PATH);
      console.error("Working directory:", gardenPath);
      if (error.code === "ENOENT") {
        sendStatusUpdate(
          "Garden command not found",
          "Please install: npm install -g @adaptivekind/garden",
        );
        reject(
          new Error(
            "Garden command not found. Please install @adaptivekind/garden globally: npm install -g @adaptivekind/garden",
          ),
        );
      } else {
        sendStatusUpdate("Garden process error", error.message);
        reject(error);
      }
    });

    gardenProcess.on("exit", (code: number | null) => {
      console.log(`Garden process exited with code ${code}`);
      if (code !== 0 && stderr) {
        console.error("Garden stderr:", stderr);
      }
    });

    // Give garden a moment to start before checking port
    setTimeout(() => {
      console.log(
        `[${Date.now() - startTime}ms] Starting port check after 1s delay`,
      );
      sendStatusUpdate("Waiting for garden server...", "Checking port 8888");
      checkPort(8888, (isOpen: boolean) => {
        if (isOpen) {
          sendStatusUpdate("Garden server ready!", "Port 8888 is responding");
          resolve();
        } else {
          sendStatusUpdate("Retrying connection...", "Port 8888 not ready yet");
          setTimeout(() => {
            console.log(
              `[${Date.now() - startTime}ms] Final port check attempt`,
            );
            checkPort(8888, (isOpen: boolean) => {
              if (isOpen) {
                console.log(
                  `[${Date.now() - startTime}ms] Port 8888 is finally open!`,
                );
                sendStatusUpdate(
                  "Garden server ready!",
                  "Port 8888 is responding",
                );
                resolve();
              } else {
                console.log(
                  `[${Date.now() - startTime}ms] Port 8888 still not open after retries`,
                );
                console.log("Garden stdout:", stdout);
                console.log("Garden stderr:", stderr);
                console.log(
                  "Garden process still alive:",
                  gardenProcess && !gardenProcess.killed,
                );
                sendStatusUpdate(
                  "Connection failed",
                  "Garden server not responding",
                );
                reject(
                  new Error(`Garden server did not start in directory: ${gardenPath}

Garden stdout: ${stdout}
Garden stderr: ${stderr}

Please ensure:
1. 'garden' command is installed
2. Directory contains a valid garden project
3. Port 8888 is available`),
                );
              }
            });
          }, 3000);
        }
      });
    }, 1000);
  });
}

function checkPort(port: number, callback: (isOpen: boolean) => void): void {
  const socket = new net.Socket();

  socket.setTimeout(1000);

  socket.on("connect", () => {
    socket.destroy();
    callback(true);
  });

  socket.on("timeout", () => {
    socket.destroy();
    callback(false);
  });

  socket.on("error", () => {
    callback(false);
  });

  socket.connect(port, "localhost");
}

function createTray(): void {
  try {
    // Icon is in the project root, not in dist/
    const iconPath = path.join(__dirname, "..", "menu-icon.png");
    console.log("Attempting to create tray with icon:", iconPath);

    if (!fs.existsSync(iconPath)) {
      console.error("Menu icon not found at:", iconPath);
      return;
    }

    tray = new Tray(iconPath);
    tray.setToolTip("Garden App");
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    updateTrayMenu();
    console.log("Tray created successfully");
  } catch (error) {
    console.error("Failed to create tray:", error);
  }
}

function addToRecentDirectories(dirPath: string): void {
  // Remove if already exists
  recentDirectories = recentDirectories.filter(
    (dir: string) => dir !== dirPath,
  );

  // Add to beginning
  recentDirectories.unshift(dirPath);

  // Keep only last 5
  if (recentDirectories.length > 5) {
    recentDirectories = recentDirectories.slice(0, 5);
  }

  // Save to persistent storage
  saveRecentDirectories();
}

function switchToDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    currentGardenPath = dirPath;
    addToRecentDirectories(dirPath);
    updateTrayMenu();
    restartGarden();
  }
}

function updateTrayMenu(): void {
  if (!tray) return;

  // Build recent directories submenu
  const recentDirsMenu: Electron.MenuItemConstructorOptions[] =
    recentDirectories.map((dir: string) => ({
      label: path.basename(dir),
      sublabel: dir,
      click: () => switchToDirectory(dir),
    }));

  if (recentDirsMenu.length === 0) {
    recentDirsMenu.push({
      label: "No recent directories",
      enabled: false,
    });
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Configure Directory",
      click: configureDirectory,
    },
    {
      label: "Recent Directories",
      submenu: recentDirsMenu,
    },
    { type: "separator" },
    {
      label: "Current Directory",
      sublabel: currentGardenPath,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Restart Garden",
      click: restartGarden,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        if (gardenProcess) {
          gardenProcess.kill("SIGTERM");
          setTimeout(() => {
            if (gardenProcess && !gardenProcess.killed) {
              gardenProcess.kill("SIGKILL");
            }
          }, 1000);
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function configureDirectory(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Garden Directory",
    defaultPath: currentGardenPath,
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath: string = result.filePaths[0];
    currentGardenPath = newPath;

    // Add to recent directories
    addToRecentDirectories(newPath);

    // Update tray menu to show new directory
    updateTrayMenu();

    // Restart garden with new directory
    restartGarden();
  }
}

function restartGarden(): void {
  if (gardenProcess) {
    gardenProcess.kill();
  }

  mainWindow?.loadFile("loading.html");

  startGarden()
    .then(() => {
      setTimeout(() => {
        mainWindow?.loadURL("http://localhost:8888");
      }, 1000);
    })
    .catch((error) => {
      console.error("Error starting garden:", error);
      mainWindow?.loadFile("error.html");
    });
}

app.whenReady().then(() => {
  console.log("App ready, starting initialization...");

  // Load recent directories from persistent storage
  loadRecentDirectories();
  console.log("Recent directories loaded");

  createWindow();
  console.log("Window created");

  createTray();
  console.log("Tray created");

  // Start immediately after window is ready
  setTimeout(() => {
    console.log("Starting main process, current directory:", currentGardenPath);
    sendStatusUpdate(
      "App initialized",
      `Current directory: ${currentGardenPath}`,
    );

    // Check if default directory exists, if not, prompt user to configure
    if (!fs.existsSync(currentGardenPath)) {
      console.log("Directory does not exist:", currentGardenPath);
      sendStatusUpdate("Directory not found", `Missing: ${currentGardenPath}`);
      mainWindow?.loadFile("error.html");
      // Show directory configuration dialog after a brief delay
      setTimeout(() => {
        configureDirectory();
      }, 2000);
    } else {
      console.log("Directory exists, starting garden...");
      // Start garden immediately
      startGarden()
        .then(() => {
          console.log("Garden started successfully, loading localhost:8888");
          setTimeout(() => {
            mainWindow?.loadURL("http://localhost:8888");
          }, 1000);
        })
        .catch((error) => {
          console.error("Error starting garden:", error);
          sendStatusUpdate("Garden failed", error.message);
          mainWindow?.loadFile("error.html");
        });
    }
  }, 200);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (gardenProcess) {
    gardenProcess.kill("SIGTERM");
    setTimeout(() => {
      if (gardenProcess && !gardenProcess.killed) {
        gardenProcess.kill("SIGKILL");
      }
    }, 2000);
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (gardenProcess) {
    gardenProcess.kill("SIGTERM");
    setTimeout(() => {
      if (gardenProcess && !gardenProcess.killed) {
        gardenProcess.kill("SIGKILL");
      }
    }, 2000);
  }
});

// IPC handlers
ipcMain.handle("restart-garden", async (): Promise<boolean> => {
  return new Promise((resolve) => {
    restartGarden();
    resolve(true);
  });
});

ipcMain.handle("configure-directory", async (): Promise<boolean> => {
  await configureDirectory();
  return true;
});
