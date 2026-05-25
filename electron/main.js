import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import os from 'os';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Configure autoUpdater
autoUpdater.autoDownload = false; // We want to trigger it manually
autoUpdater.autoInstallOnAppQuit = false;

// Only import the server if we are NOT in dev mode
// In dev, the 'concurrently' command handles the server
if (!isDev) {
  import('../server/src/index.js').catch(err => {
    console.error('[Server] Failed to start:', err);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sidecarProcesses = [];

function startSidecar(port, scriptName, serviceName) {
  const isPackaged = app.isPackaged;
  const tag = `[${serviceName}]`;

  let pythonPath;
  if (!isPackaged) {
    const py311Path = process.platform === 'win32'
      ? path.join(__dirname, '../python/venv_py311/Scripts/python.exe')
      : path.join(__dirname, '../python/venv_py311/bin/python');
    pythonPath = fs.existsSync(py311Path) ? py311Path
      : (process.platform === 'win32'
        ? path.join(__dirname, '../python/venv/Scripts/python.exe')
        : path.join(__dirname, '../python/venv/bin/python'));
  } else {
    const py311Path = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'python/venv_py311/Scripts/python.exe')
      : path.join(process.resourcesPath, 'python/venv_py311/bin/python');
    pythonPath = fs.existsSync(py311Path) ? py311Path
      : (process.platform === 'win32'
        ? path.join(process.resourcesPath, 'python/venv/Scripts/python.exe')
        : path.join(process.resourcesPath, 'python/venv/bin/python'));
  }

  const scriptPath = !isPackaged
    ? path.join(__dirname, '../python', scriptName)
    : path.join(process.resourcesPath, 'python', scriptName);

  if (!fs.existsSync(pythonPath)) {
    console.warn(`${tag} Python not found at:`, pythonPath);
    const runtimePath = !isPackaged
      ? path.join(__dirname, '../python/runtime/python.exe')
      : path.join(process.resourcesPath, 'python/runtime/python.exe');
    if (fs.existsSync(runtimePath)) {
      pythonPath = runtimePath;
      console.log(`${tag} Found portable runtime.`);
    } else {
      console.error(`${tag} No Python environment found.`);
      return;
    }
  }

  console.log(`${tag} Starting sidecar on port ${port}...`);

  // Kill stale process on target port
  try {
    if (process.platform === 'win32') {
      try {
        const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
        const pid = out.trim().split(/\s+/).pop();
        if (pid && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      try { execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
    }
  } catch {}

  const cpuCount = os.cpus().length;
  const proc = spawn(pythonPath, [scriptPath], {
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      OMP_NUM_THREADS: String(cpuCount),
      MKL_NUM_THREADS: String(cpuCount),
      OPENBLAS_NUM_THREADS: String(cpuCount),
    }
  });

  proc.stdout.on('data', (d) => console.log(`${tag} ${d}`));
  proc.stderr.on('data', (d) => console.error(`${tag} Error: ${d}`));
  proc.on('close', (code) => console.log(`${tag} Exited with code ${code}`));

  sidecarProcesses.push(proc);
  return proc;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, // Slightly wider for the new resizable layout
    height: 900,
    title: "Waifu AI Companion",
    icon: path.join(__dirname, '../client/public/icon.png'),
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools(); // Let's see the errors!
  } else {
    win.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }

  // Set up auto-updater IPC events
  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('update-event', { type: 'checking' });
  });
  
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-event', { type: 'available', info });
  });
  
  autoUpdater.on('update-not-available', (info) => {
    win.webContents.send('update-event', { type: 'not-available', info });
  });
  
  autoUpdater.on('error', (err) => {
    win.webContents.send('update-event', { type: 'error', error: err.message });
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('update-event', { type: 'progress', progressObj });
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-event', { type: 'downloaded', info });
  });
}

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ─── GPU Fix: NVIDIA + Wayland/Hyprland + Electron ──────────────────────────
// Only apply Linux-specific workarounds on Linux (NVIDIA + Wayland).
// On Windows/macOS these flags may degrade performance or security.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('in-process-gpu');
}
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');
// Allow getDisplayMedia() from file: protocol (production builds)
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'file://');

// ─── Global Screenshot Capture ──────────────────────────────────────
const SCREENSHOT_TOOLS = [
  { cmd: 'gnome-screenshot', args: ['-f'] },
  { cmd: 'grim', args: [] },
  { cmd: 'spectacle', args: ['-b', '-n', '-o'] },
  { cmd: 'flameshot', args: ['full', '-p'] },
  { cmd: 'import', args: ['-window', 'root'] },
  { cmd: 'scrot', args: ['-z'] },
];

const INSTALL_HINTS = {
  'gnome-screenshot': `sudo apt install gnome-screenshot  # or your distro's package manager`,
  'grim': `sudo apt install grim  # Wayland screenshot tool`,
  'spectacle': `sudo apt install spectacle  # KDE`,
  'flameshot': `sudo apt install flameshot  # Cross-desktop`,
  'import': `sudo apt install imagemagick  # X11 fallback`,
  'scrot': `sudo apt install scrot  # lightweight X11 fallback`,
};

function takeDesktopScreenshot() {
  const tmpPath = path.join(app.getPath('temp'), `waifu-screenshot-${Date.now()}.png`);
  const tool = SCREENSHOT_TOOLS.find(t => {
    try {
      execSync(`which ${t.cmd}`, { stdio: 'ignore' });
      return true;
    } catch { return false; }
  });
  if (!tool) {
    const hints = Object.values(INSTALL_HINTS).join('\n');
    return { error: `No screenshot tool found. Install one:\n${hints}` };
  }
  try {
    execSync(`${tool.cmd} ${tool.args.join(' ')} ${tmpPath}`, { stdio: 'ignore', timeout: 10000 });
    const buffer = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);
    return { data: buffer.toString('base64') };
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    // Remove path details from the error message for brevity
    const msg = err.message.replace(/\/[^\s]+\/([^\s]+\.png)/g, '$1');
    return { error: `Screenshot tool '${tool.cmd}' failed: ${msg}` };
  }
}

function sendScreenshotToWindow(data) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('screenshot-captured', data);
  }
}

app.whenReady().then(() => {
  // Register global shortcut (works across workspaces / when app unfocused)
  const registered = globalShortcut.register('CmdOrCtrl+Shift+S', () => {
    if (!BrowserWindow.getAllWindows().length) return;
    const result = takeDesktopScreenshot();
    sendScreenshotToWindow(result);
  });
  if (!registered) {
    console.warn('[Main] Failed to register global shortcut CmdOrCtrl+Shift+S');
  }

  // IPC for renderer-triggered capture (app window fallback)
  ipcMain.handle('capture-screenshot', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return { error: 'No window found' };
    try {
      const image = await win.webContents.capturePage();
      return { data: image.toPNG().toString('base64') };
    } catch (err) {
      return { error: err.message };
    }
  });

  startSidecar(5000, 'tts_server.py', 'TTS');
  startSidecar(5001, 'stt_server.py', 'STT');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  for (const proc of sidecarProcesses) {
    console.log(`[Main] Killing sidecar (pid ${proc.pid})...`);
    proc.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure sidecars are killed even on unexpected exits
process.on('exit', () => {
  for (const proc of sidecarProcesses) {
    if (proc.exitCode === null) proc.kill();
  }
});
