const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  getVideoResolution: (filePath) => ipcRenderer.invoke('video:getResolution', filePath),
  startProcessing: (data) => ipcRenderer.send('process:start', data),
  stopProcessing: () => ipcRenderer.send('process:stop'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  testR2Settings: (settings) => ipcRenderer.invoke('settings:testR2', settings),
  listR2Objects: (prefix) => ipcRenderer.invoke('r2:listObjects', prefix),
  deleteR2Object: (data) => ipcRenderer.invoke('r2:deleteObject', data),
  deleteBatchR2Objects: (items) => ipcRenderer.invoke('r2:deleteBatch', items),
  uploadAnyR2File: (prefix) => ipcRenderer.invoke('r2:uploadAnyFile', prefix),
  
  onTranscodeProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('transcode:progress', subscription);
    return () => ipcRenderer.removeListener('transcode:progress', subscription);
  },
  onUploadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('upload:progress', subscription);
    return () => ipcRenderer.removeListener('upload:progress', subscription);
  },
  onStatusChange: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('status:change', subscription);
    return () => ipcRenderer.removeListener('status:change', subscription);
  },
  onCancelled: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('process:cancelled', subscription);
    return () => ipcRenderer.removeListener('process:cancelled', subscription);
  },
  onError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('process:error', subscription);
    return () => ipcRenderer.removeListener('process:error', subscription);
  },
  onComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('process:complete', subscription);
    return () => ipcRenderer.removeListener('process:complete', subscription);
  }
});
