import { contextBridge, ipcRenderer } from "electron";

// Define the API interface
export interface ElectronAPI {
  restartGarden: () => Promise<boolean>;
  configureDirectory: () => Promise<boolean>;
  installGarden: () => Promise<boolean>;
  onStatusUpdate: (
    callback: (status: string, details?: string) => void,
  ) => void;
  onShowErrorDetails: (callback: (errorMessage: string) => void) => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  restartGarden: (): Promise<boolean> => ipcRenderer.invoke("restart-garden"),
  configureDirectory: (): Promise<boolean> =>
    ipcRenderer.invoke("configure-directory"),
  installGarden: (): Promise<boolean> => ipcRenderer.invoke("install-garden"),
  onStatusUpdate: (callback: (status: string, details?: string) => void) => {
    ipcRenderer.on("status-update", (_, status: string, details?: string) => {
      callback(status, details);
    });
  },
  onShowErrorDetails: (callback: (errorMessage: string) => void) => {
    ipcRenderer.on("show-error-details", (_, errorMessage: string) => {
      callback(errorMessage);
    });
  },
} as ElectronAPI);

// Extend the global Window interface to include our API
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
