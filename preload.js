const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  getVideoResolution: (filePath) => ipcRenderer.invoke('video:getResolution', filePath),
  startProcessing: (data) => ipcRenderer.send('process:start', data),
  stopProcessing: () => ipcRenderer.send('process:stop'),
  startM3u8Copy: (data) => ipcRenderer.send('m3u8:startCopy', data),
  stopM3u8Copy: () => ipcRenderer.send('m3u8:stopCopy'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getFFmpegStatus: () => ipcRenderer.invoke('ffmpeg:getStatus'),
  testR2Settings: (settings) => ipcRenderer.invoke('settings:testR2', settings),
  listR2Objects: (prefix) => ipcRenderer.invoke('r2:listObjects', prefix),
  checkR2FolderExists: (data) => ipcRenderer.invoke('r2:checkFolderExists', data),
  deleteR2Object: (data) => ipcRenderer.invoke('r2:deleteObject', data),
  deleteBatchR2Objects: (items) => ipcRenderer.invoke('r2:deleteBatch', items),
  createR2Folder: (data) => ipcRenderer.invoke('r2:createFolder', data),
  uploadAnyR2File: (prefix) => ipcRenderer.invoke('r2:uploadAnyFile', prefix),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  
  checkUpdate: (isManual) => ipcRenderer.invoke('updater:check', { isManual }),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  skipVersion: (version) => ipcRenderer.invoke('updater:skipVersion', version),
  disableAutoUpdateSetting: (disable) => ipcRenderer.invoke('updater:disableSetting', disable),

  onUpdateProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater:downloadProgress', subscription);
    return () => ipcRenderer.removeListener('updater:downloadProgress', subscription);
  },
  onUpdateDownloaded: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater:downloaded', subscription);
    return () => ipcRenderer.removeListener('updater:downloaded', subscription);
  },
  
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
  onQualityStateChange: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('upload:qualityState', subscription);
    return () => ipcRenderer.removeListener('upload:qualityState', subscription);
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
  },

  onM3u8Progress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('m3u8:progress', subscription);
    return () => ipcRenderer.removeListener('m3u8:progress', subscription);
  },
  onM3u8Status: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('m3u8:status', subscription);
    return () => ipcRenderer.removeListener('m3u8:status', subscription);
  },
  onM3u8Complete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('m3u8:complete', subscription);
    return () => ipcRenderer.removeListener('m3u8:complete', subscription);
  },
  onM3u8Error: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('m3u8:error', subscription);
    return () => ipcRenderer.removeListener('m3u8:error', subscription);
  },
  onM3u8Cancelled: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('m3u8:cancelled', subscription);
    return () => ipcRenderer.removeListener('m3u8:cancelled', subscription);
  }
});
