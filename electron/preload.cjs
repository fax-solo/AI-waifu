const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

let captureScreenshotImpl;

// desktopCapturer may be undefined in some Electron 34 builds
if (typeof desktopCapturer?.getSources === 'function') {
  captureScreenshotImpl = async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources.length) return { error: 'No screen sources found' };
    // Use the first screen source (usually the primary monitor)
    const source = sources.find(s => s.name === 'Entire screen') || sources[0];
    const png = source.thumbnail.toPNG();
    return { data: png.toString('base64') };
  };
} else {
  // Fallback: use main process capturePage (app window only)
  captureScreenshotImpl = async () => {
    try {
      return await ipcRenderer.invoke('capture-screenshot');
    } catch {
      return { error: 'Screen capture not available' };
    }
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateEvent: (callback) => ipcRenderer.on('update-event', (_event, data) => callback(data)),
  removeUpdateListeners: () => ipcRenderer.removeAllListeners('update-event'),
  captureScreenshot: () => captureScreenshotImpl(),
  onScreenshot: (callback) => {
    ipcRenderer.on('screenshot-captured', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('screenshot-captured');
  },
});
