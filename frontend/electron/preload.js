const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  selectBackupFolder: () => ipcRenderer.invoke('backup:select-folder'),
  saveBackupJson: (payload) => ipcRenderer.invoke('backup:save-json', payload),
  loadBackupJson: (payload) => ipcRenderer.invoke('backup:load-json', payload),
});

