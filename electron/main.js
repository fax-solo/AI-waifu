import { app, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

// Only import the server if we are NOT in dev mode
// In dev, the 'concurrently' command handles the server
if (!isDev) {
  import('../server/src/index.js');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ttsProcess = null;

function startTTSSidecar() {
  const isDev = !app.isPackaged;
  
  // Try to find python in venv first, fallback to system python
  let pythonPath;
  if (isDev) {
    pythonPath = process.platform === 'win32'
      ? path.join(__dirname, '../python/venv/Scripts/python.exe')
      : path.join(__dirname, '../python/venv/bin/python');
  } else {
    pythonPath = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'python/venv/Scripts/python.exe')
      : path.join(process.resourcesPath, 'python/venv/bin/python');
  }

  if (!fs.existsSync(pythonPath)) {
    console.log('[TTS] Venv not found, checking system paths...');
    // Common Windows python paths to avoid the Windows Store stub
    const commonPaths = [
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python39\\python.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\Python\\Python311\\python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\Python\\Python310\\python.exe'),
      'python' // Fallback to PATH
    ];
    
    pythonPath = 'python'; // Default fallback
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        pythonPath = p;
        break;
      }
    }
  }
  
  const scriptPath = isDev
    ? path.join(__dirname, '../python/tts_server.py')
    : path.join(process.resourcesPath, 'python/tts_server.py');

  console.log('[TTS] Starting sidecar server...');
  console.log(`[TTS] Command: ${pythonPath} ${scriptPath}`);

  // Kill any stale TTS process on port 5000 before starting
  try {
    const { execSync } = require('child_process');
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
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools(); // Let's see the errors!
  } else {
    win.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }
}

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
