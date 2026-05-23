import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

// Configure autoUpdater
autoUpdater.autoDownload = false; // We want to trigger it manually
autoUpdater.autoInstallOnAppQuit = false;

// Only import the server if we are NOT in dev mode
// In dev, the 'concurrently' command handles the server
if (!isDev) {
  import('../server/src/index.js');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ttsProcess = null;

function startTTSSidecar() {
  const isPackaged = app.isPackaged;
  
  // Resolve python path
  let pythonPath;
  if (!isPackaged) {
    const py311Path = process.platform === 'win32'
      ? path.join(__dirname, '../python/venv_py311/Scripts/python.exe')
      : path.join(__dirname, '../python/venv_py311/bin/python');
      
    if (fs.existsSync(py311Path)) {
      pythonPath = py311Path;
    } else {
      pythonPath = process.platform === 'win32'
        ? path.join(__dirname, '../python/venv/Scripts/python.exe')
        : path.join(__dirname, '../python/venv/bin/python');
    }
  } else {
    // In production, check for venv in the resources folder
    const py311Path = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'python/venv_py311/Scripts/python.exe')
      : path.join(process.resourcesPath, 'python/venv_py311/bin/python');
      
    if (fs.existsSync(py311Path)) {
      pythonPath = py311Path;
    } else {
      pythonPath = process.platform === 'win32'
        ? path.join(process.resourcesPath, 'python/venv/Scripts/python.exe')
        : path.join(process.resourcesPath, 'python/venv/bin/python');
    }
  }

  const scriptPath = !isPackaged
    ? path.join(__dirname, '../python/tts_server.py')
    : path.join(process.resourcesPath, 'python/tts_server.py');

  if (!fs.existsSync(pythonPath)) {
    console.warn('[TTS] Sidecar Python not found at:', pythonPath);
    // If venv is missing, check for a portable runtime bootstrap
    const runtimePath = !isPackaged
      ? path.join(__dirname, '../python/runtime/python.exe')
      : path.join(process.resourcesPath, 'python/runtime/python.exe');
    
    if (fs.existsSync(runtimePath)) {
      pythonPath = runtimePath;
      console.log('[TTS] Found portable runtime, using it for sidecar.');
    } else {
      console.error('[TTS] No Python environment found. Sidecar will not start until setup is complete.');
      return; // Exit and let the UI handle setup
    }
  }

  console.log('[TTS] Starting sidecar server...');
  console.log(`[TTS] Command: ${pythonPath} ${scriptPath}`);

  // Kill any stale TTS process on port 5000 before starting
  try {
    if (process.platform === 'win32') {
      // Windows: find and kill process on port 5000
      try {
        const out = execSync('netstat -ano | findstr :5000 | findstr LISTENING', { encoding: 'utf8' });
        const pid = out.trim().split(/\s+/).pop();
        if (pid && pid !== '0') {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`[TTS] Killed stale process ${pid} on port 5000`);
        }
      } catch (e) { /* no process on port */ }
    } else {
      // Linux/macOS: use fuser or lsof
      try {
        execSync('fuser -k 5000/tcp 2>/dev/null || true', { stdio: 'ignore' });
        console.log('[TTS] Cleared port 5000');
      } catch (e) { /* no process on port */ }
    }
  } catch (e) { /* ignore cleanup errors */ }

  // NOTE: Do not auto-run pip install here — it reinstalls base onnxruntime
  // which conflicts with onnxruntime-directml. Run pip manually if needed.

  // Pass OMP/MKL thread counts so ONNX uses all available CPU cores
  const cpuCount = os.cpus().length;
  ttsProcess = spawn(pythonPath, [scriptPath], {
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      OMP_NUM_THREADS: String(cpuCount),
      MKL_NUM_THREADS: String(cpuCount),
      OPENBLAS_NUM_THREADS: String(cpuCount),
    }
  });

  ttsProcess.stdout.on('data', (data) => {
    console.log(`[TTS] ${data}`);
  });

  ttsProcess.stderr.on('data', (data) => {
    console.error(`[TTS Error] ${data}`);
  });

  ttsProcess.on('close', (code) => {
    console.log(`[TTS] Process exited with code ${code}`);
  });
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
// Root cause: Chromium's Ozone layer uses DMA-BUF to share GPU textures between
// its internal processes. NVIDIA's Wayland EGL implementation does NOT support
// the DMA-BUF formats Ozone expects, causing eglCreateImage failures and
// OzoneImageBacking crashes.
//
// Fix: Force XWayland mode (where NVIDIA's GL stack is battle-tested) and run
// the GPU in-process to bypass the broken inter-process texture sharing entirely.
app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');

app.whenReady().then(() => {
  startTTSSidecar();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (ttsProcess) {
    console.log('[TTS] Killing sidecar server...');
    ttsProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure TTS is killed even on unexpected exits
process.on('exit', () => {
  if (ttsProcess) ttsProcess.kill();
});
