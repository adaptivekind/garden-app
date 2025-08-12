import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface
export interface ElectronAPI {
  restartGarden: () => Promise<boolean>;
  configureDirectory: () => Promise<boolean>;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  restartGarden: (): Promise<boolean> => ipcRenderer.invoke('restart-garden'),
  configureDirectory: (): Promise<boolean> => ipcRenderer.invoke('configure-directory')
} as ElectronAPI);

// Extend the global Window interface to include our API
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}