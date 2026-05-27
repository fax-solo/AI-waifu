import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const router = express.Router();

async function getDiskInfo() {
  try {
    const stats = await fs.promises.statfs(process.cwd());
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const freeGB = freeBytes / (1024 ** 3);
    const totalGB = totalBytes / (1024 ** 3);
    return {
      freeGB: Math.round(freeGB * 100) / 100,
      totalGB: Math.round(totalGB * 100) / 100,
      enough: freeGB > 0.5,
    };
  } catch {
    return { freeGB: null, totalGB: null, enough: true };
  }
}

function getOsInfo() {
  const platform = os.platform();
  const release = os.release();
  const supported = ['linux', 'darwin', 'win32'].includes(platform);
  return {
    platform,
    release,
    supported,
    label: platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux',
  };
}

async function getGpuInfo() {
  return new Promise((resolve) => {
    const proc = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ hasNvidia: false, name: null });
    }, 5000);
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && output.trim()) {
        resolve({
          hasNvidia: true,
          name: output.trim().split('\n')[0]
        });
      } else {
        resolve({
          hasNvidia: false,
          name: null
        });
      }
    });
    proc.on('error', () => {
      clearTimeout(timeout);
      resolve({
        hasNvidia: false,
        name: null
      });
    });
  });
}

function detectRootDir() {
  // Walk up from cwd to find the project root (where models.json lives)
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'models.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // In production (Electron), check alongside the executable
  const isProd = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
  if (isProd && process.execPath) {
    const exeDir = path.dirname(process.execPath);
    if (fs.existsSync(path.join(exeDir, 'models.json'))) return exeDir;
  }
  if (isProd && process.resourcesPath) {
    return process.resourcesPath;
  }
  return process.cwd();
}

router.get('/status', async (req, res) => {
  try {
    const rootDir = detectRootDir();
      
    const pythonDir = path.join(rootDir, 'python');
    const modelsPath = path.join(rootDir, 'models.json');
    const markerPath = path.join(rootDir, '.setup-complete');
    
    let modelsMissing = false;
    if (fs.existsSync(modelsPath)) {
      const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8').replace(/^\uFEFF/, ''));
      for (const service in models) {
        for (const asset in models[service]) {
          if (!fs.existsSync(path.join(rootDir, models[service][asset].path))) {
            modelsMissing = true;
            break;
          }
        }
        if (modelsMissing) break;
      }
    } else {
      modelsMissing = true;
    }

    const isWindows = os.platform() === 'win32';
    const venvName = resolveVenvName(pythonDir);
    const venvPath = path.join(pythonDir, venvName);
    const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
    const venvValid = fs.existsSync(venvPath) && fs.existsSync(binDir);
    const setupComplete = fs.existsSync(markerPath);

    const [gpuInfo, diskInfo] = await Promise.all([getGpuInfo(), getDiskInfo()]);
    const osInfo = getOsInfo();

    res.json({
      setupRequired: !setupComplete && (modelsMissing || !venvValid),
      modelsMissing,
      venvMissing: !venvValid,
      setupComplete,
      gpuInfo,
      diskInfo,
      osInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const rootDir = detectRootDir();
    const markerPath = path.join(rootDir, '.setup-complete');
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');

    // Start TTS Python sidecar
    const pythonDir = path.join(rootDir, 'python');
    const venvName = resolveVenvName(pythonDir);
    const venvPath = path.join(pythonDir, venvName);
    const isWindows = os.platform() === 'win32';
    const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
    const pythonExe = path.join(binDir, isWindows ? 'python.exe' : 'python');
    const scriptPath = path.join(pythonDir, 'tts_server.py');

    if (fs.existsSync(pythonExe) && fs.existsSync(scriptPath)) {
      // Kill stale process on port 5000
      if (isWindows) {
        try {
          const result = execSync(`netstat -ano | findstr :5000 | findstr LISTENING`, { encoding: 'utf8', timeout: 3000 });
          const lines = result.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
              try { execSync(`taskkill /PID ${pid} /F`, { timeout: 2000 }); } catch {}
            }
          }
        } catch {}
      } else {
        try { execSync(`fuser -k 5000/tcp 2>/dev/null`, { timeout: 3000 }); } catch {}
      }

      const proc = spawn(pythonExe, [scriptPath], {
        cwd: pythonDir,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        }
      });
      proc.unref();
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function runCommand(command, args, cwd, sendEvent, progressUpdate) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd });
    
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) sendEvent('log', { text: line.trim(), type: 'info' });
      }
      if (progressUpdate) progressUpdate();
    });
    
    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        // pip logs warnings/progress to stderr, we'll mark it as info so it doesn't look like a total failure
        if (line.trim()) sendEvent('log', { text: line.trim(), type: 'info' });
      }
      if (progressUpdate) progressUpdate();
    });
    
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

function resolveVenvName(pythonDir) {
  if (fs.existsSync(path.join(pythonDir, 'venv_py311'))) return 'venv_py311';
  if (fs.existsSync(path.join(pythonDir, 'venv'))) return 'venv';
  return 'venv_py311'; // default for fresh installs
}

async function findPython(pythonDir, sendEvent) {
  const candidates = os.platform() === 'win32'
    ? ['python']
    : ['python3.11', 'python3.10', 'python3.12', 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      const proc = spawn(cmd, ['--version'], { cwd: pythonDir });
      await new Promise((resolve, reject) => {
        proc.on('close', (code) => code === 0 ? resolve() : reject());
        proc.on('error', reject);
      });
      return cmd;
    } catch {
      continue;
    }
  }
  return null;
}

function isVenvValid(venvPath) {
  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
  const pythonExe = isWindows ? 'python.exe' : 'python';
  return fs.existsSync(venvPath) && fs.existsSync(path.join(binDir, pythonExe));
}

async function bootstrapPython(pkgId, venvPath, sendEvent, gpuNvidia, gpuAmd, gpuName) {
  const rootDir = detectRootDir();
    
  const pythonDir = path.join(rootDir, 'python');
  if (!fs.existsSync(pythonDir)) fs.mkdirSync(pythonDir, { recursive: true });
  
  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
  
  sendEvent('progress', { id: pkgId, status: 'active', progress: 5 });

  // Remove incompatible venv (wrong OS layout)
  if (fs.existsSync(venvPath) && !isVenvValid(venvPath)) {
    sendEvent('log', { text: `Found incomplete or incompatible virtual environment. Removing...`, type: 'warning' });
    fs.rmSync(venvPath, { recursive: true, force: true });
  }
  
  if (!fs.existsSync(venvPath)) {
    sendEvent('log', { text: `Creating virtual environment in ${venvPath}...`, type: 'info' });
    let pyCmd = await findPython(pythonDir, sendEvent);
    let hasPython = !!pyCmd;
    
    if (!hasPython) {
      sendEvent('log', { text: `System Python not found.`, type: 'warning' });
    }

    // Windows: download portable Python if system Python is missing
    if (!hasPython && isWindows) {
      const portablePyDir = path.join(pythonDir, 'runtime');
      const zipPath = path.join(pythonDir, 'python-portable.zip');
      const pyUrl = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';
      
      if (!fs.existsSync(portablePyDir)) {
        fs.mkdirSync(portablePyDir, { recursive: true });
        sendEvent('log', { text: `Downloading portable Python runtime (3.11.9)...`, type: 'info' });
        
        try {
          const response = await fetch(pyUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(zipPath, Buffer.from(buffer));
          
          sendEvent('log', { text: `Extracting Python runtime...`, type: 'info' });
          await runCommand('powershell', ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${portablePyDir}" -Force`], pythonDir, sendEvent);
          fs.unlinkSync(zipPath);
        } catch (err) {
          sendEvent('log', { text: `Failed to download portable Python: ${err.message}`, type: 'error' });
          throw err;
        }

        // Fix the ._pth file to allow pip and site-packages
        const pthFile = path.join(portablePyDir, 'python311._pth');
        if (fs.existsSync(pthFile)) {
          fs.writeFileSync(pthFile, 'python311.zip\n.\n#import site\nimport site');
        }
      }
      
      pyCmd = path.join(portablePyDir, 'python.exe');
      hasPython = true;
      
      // Install pip if missing
      if (!fs.existsSync(path.join(portablePyDir, 'Scripts', 'pip.exe'))) {
        sendEvent('log', { text: `Installing pip for portable runtime...`, type: 'info' });
        
        // Use local get-pip.py if available in root or python dir
        const localGetPip = [
          path.join(rootDir, 'get-pip.py'),
          path.join(pythonDir, 'get-pip.py')
        ].find(p => fs.existsSync(p));

        if (localGetPip) {
          sendEvent('log', { text: `Using local get-pip.py...`, type: 'info' });
          await runCommand(pyCmd, [localGetPip], portablePyDir, sendEvent);
        } else {
          const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
          sendEvent('log', { text: `Downloading get-pip.py...`, type: 'info' });
          const getPipResp = await fetch(getPipUrl);
          const getPipBuf = await getPipResp.arrayBuffer();
          const getPipPath = path.join(portablePyDir, 'get-pip.py');
          fs.writeFileSync(getPipPath, Buffer.from(getPipBuf));
          await runCommand(pyCmd, [getPipPath], portablePyDir, sendEvent);
          fs.unlinkSync(getPipPath);
        }
      }
    }

    if (!hasPython) {
      sendEvent('log', { text: `Python is not installed.`, type: 'error' });
      sendEvent('log', { text: `Please install Python 3.10 or later from https://python.org`, type: 'info' });
      throw new Error('Python not found');
    }

    try {
      await runCommand(pyCmd, ['-m', 'venv', 'venv_py311'], pythonDir, sendEvent);
    } catch (e) {
      // If venv module is missing (common with embedded Python on Windows), copy the runtime as venv
      sendEvent('log', { text: `Creating venv failed (missing venv module?). Copying Python environment as fallback...`, type: 'warning' });
      if (isWindows && fs.existsSync(path.join(pythonDir, 'runtime'))) {
        const runtimeDir = path.join(pythonDir, 'runtime');
        // Copy runtime files into the venv directory structure
        fs.cpSync(runtimeDir, venvPath, { recursive: true, force: true });
        // Manually create the Scripts dir with pip
        const scriptsDir = path.join(venvPath, 'Scripts');
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
        if (fs.existsSync(path.join(runtimeDir, 'Scripts', 'pip.exe'))) {
          fs.cpSync(path.join(runtimeDir, 'Scripts'), scriptsDir, { recursive: true, force: true });
        }
      } else {
        sendEvent('log', { text: `Failed to create venv: ${e.message}. Please install Python manually.`, type: 'error' });
        throw e;
      }
    }
  } else {
    sendEvent('log', { text: `Virtual environment already exists.`, type: 'success' });
  }
  
  sendEvent('progress', { id: pkgId, status: 'active', progress: 20 });
  
  const pipCmd = isWindows 
    ? path.join(venvPath, 'Scripts', 'pip.exe')
    : path.join(venvPath, 'bin', 'pip');
  
  if (!fs.existsSync(pipCmd)) {
    throw new Error(`pip not found at ${pipCmd}. Virtual environment is incomplete.`);
  }
    
  let fakeProgress = 20;
  const advanceProgress = () => {
    fakeProgress += 0.5;
    if (fakeProgress > 95) fakeProgress = 95;
    sendEvent('progress', { id: pkgId, status: 'active', progress: Math.floor(fakeProgress) });
  };
  
  let engineName = 'CPU';
  if (gpuNvidia) engineName = `NVIDIA GPU: ${gpuName || 'Unknown'}`;
  else if (gpuAmd) engineName = `AMD GPU: ${gpuName || 'Unknown'}`;
  
  sendEvent('log', { text: `Installing PyTorch (${engineName})...`, type: 'info' });
  
  if (gpuNvidia) {
    await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu124'], pythonDir, sendEvent, advanceProgress);
  } else if (gpuAmd) {
    if (process.platform === 'win32') {
      await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/rocm6.2'], pythonDir, sendEvent, advanceProgress);
    } else {
      await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/rocm6.2'], pythonDir, sendEvent, advanceProgress);
    }
  } else {
    await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu'], pythonDir, sendEvent, advanceProgress);
  }
  
  sendEvent('log', { text: `Installing TTS dependencies (styletts2, fastapi, uvicorn, soundfile)...`, type: 'info' });
  const deps = ['fastapi', 'uvicorn', 'soundfile', 'styletts2'];
  await runCommand(pipCmd, ['install', ...deps], pythonDir, sendEvent, advanceProgress);
  
  // Linux: check libsndfile1 (required by soundfile)
  if (!isWindows) {
    await checkLibsndfile(sendEvent);
  }
  
  sendEvent('progress', { id: pkgId, status: 'done', progress: 100 });
  sendEvent('log', { text: `Python Environment successfully bootstrapped!`, type: 'success' });
}

async function checkLibsndfile(sendEvent) {
  try {
    const proc = spawn('ldconfig', ['-p']);
    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    await new Promise((resolve) => { proc.on('close', () => resolve()); proc.on('error', () => resolve()); });
    
    if (!output.includes('libsndfile')) {
      sendEvent('log', { text: `libsndfile1 not found on system. The TTS engine needs it for audio processing.`, type: 'warning' });
      sendEvent('log', { text: `Attempting to install libsndfile1 (requires sudo)...`, type: 'info' });
      
      try {
        await runCommand('sudo', ['apt-get', 'install', '-y', 'libsndfile1'], process.cwd(), sendEvent);
        sendEvent('log', { text: `✅ libsndfile1 installed successfully.`, type: 'success' });
      } catch {
        sendEvent('log', { text: `Could not auto-install libsndfile1.`, type: 'warning' });
        sendEvent('log', { text: `Install it manually: sudo apt-get install libsndfile1 (Debian/Ubuntu)`, type: 'info' });
        sendEvent('log', { text: `Or: sudo dnf install libsndfile (Fedora) or brew install libsndfile (Mac)`, type: 'info' });
      }
    }
  } catch {
    // ldconfig not available, skip check
  }
}

async function checkVCRedist(sendEvent) {
  if (os.platform() !== 'win32') return;
  
  const system32 = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
  const hasVC = fs.existsSync(path.join(system32, 'vcruntime140.dll')) || 
                fs.existsSync(path.join(system32, 'msvcp140.dll'));

  if (!hasVC) {
    sendEvent('log', { text: `Microsoft Visual C++ Redistributable not detected.`, type: 'warning' });
    sendEvent('log', { text: `AI models and Python require this to run. Installing...`, type: 'info' });
    
    const vcUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
    const isProd = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
    const rootDir = (isProd && process.resourcesPath)
      ? process.resourcesPath 
      : (process.cwd().endsWith('server') ? path.join(process.cwd(), '..') : process.cwd());
    const dest = path.join(rootDir, 'python', 'vc_redist.x64.exe');
    
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    
    const response = await fetch(vcUrl);
    if (!response.ok) throw new Error(`Failed to download VC++ Redist: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    sendEvent('log', { text: `Running VC++ Redistributable installer silently...`, type: 'info' });
    try {
      await runCommand(dest, ['/install', '/quiet', '/norestart'], path.dirname(dest), sendEvent);
      sendEvent('log', { text: `✅ Microsoft Visual C++ Redistributable installed.`, type: 'success' });
    } catch (e) {
      sendEvent('log', { text: `Installer exited with error. You may need to run it manually: ${dest}`, type: 'warning' });
    }
    fs.unlinkSync(dest);
  }
}

router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let destroyed = false;
  const cleanup = () => { destroyed = true; };

  req.on('close', cleanup);
  req.on('error', cleanup);

  const sendEvent = (event, data) => {
    if (destroyed || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      destroyed = true;
    }
  };

  // Keepalive — sends a comment every 10s to prevent proxies/browsers from timing out
  const keepalive = setInterval(() => {
    if (destroyed || res.destroyed) { clearInterval(keepalive); return; }
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); destroyed = true; }
  }, 10000);

  try {
    const rootDir = detectRootDir();
      
    const modelsPath = path.join(rootDir, 'models.json');
    const VENV_PATH = path.join(rootDir, 'python');
    const venvDirName = resolveVenvName(VENV_PATH);
    
    let packagesToDownload = [];
    if (fs.existsSync(modelsPath)) {
      const rawData = fs.readFileSync(modelsPath, 'utf8');
      const cleanData = rawData.replace(/^\uFEFF/, '');
      const models = JSON.parse(cleanData);
      
      for (const service in models) {
        for (const asset in models[service]) {
          const item = models[service][asset];
          packagesToDownload.push({
            id: `${service}-${asset}`,
            type: 'download',
            url: item.url,
            dest: path.join(rootDir, item.path)
          });
        }
      }
    }

    const requested = req.query.packages ? req.query.packages.split(',') : [];
    const gpuInfo = await getGpuInfo();
    const gpuName = gpuInfo.hasNvidia ? gpuInfo.name : null;
    
    const gpuNvidia = requested.includes('python-env-gpu');
    const gpuAmd = requested.includes('python-env-amd');

    // Inject python env packages if requested
    const allPkgs = [ ...packagesToDownload ];
    if (requested.includes('python-env-cpu')) {
      allPkgs.unshift({ id: 'python-env-cpu', type: 'python-env' });
    } else if (requested.includes('python-env-gpu')) {
      allPkgs.unshift({ id: 'python-env-gpu', type: 'python-env' });
    } else if (requested.includes('python-env-amd')) {
      allPkgs.unshift({ id: 'python-env-amd', type: 'python-env' });
    }

    // Map TTS model package IDs to their download entries
    // tts-ljspeech → includes tts-model_ljspeech + tts-config_ljspeech
    // tts-libritts → includes tts-model_libritts + tts-config_libritts
    // tts-deferred → no download entries (auto-download on first use)
    const expandedRequested = new Set(requested);
    if (requested.includes('tts-ljspeech')) {
      expandedRequested.add('tts-model_ljspeech');
      expandedRequested.add('tts-config_ljspeech');
    }
    if (requested.includes('tts-libritts')) {
      expandedRequested.add('tts-model_libritts');
      expandedRequested.add('tts-config_libritts');
    }

    const targetPackages = requested.length > 0 
      ? allPkgs.filter(p => expandedRequested.has(p.id)) 
      : allPkgs;

    sendEvent('log', { text: `Starting setup sequence for ${targetPackages.length} packages...`, type: 'info' });

    // Check for Windows dependencies
    await checkVCRedist(sendEvent);

    for (const pkg of targetPackages) {
      if (destroyed) break;
      if (pkg.type === 'python-env') {
        await bootstrapPython(pkg.id, path.join(VENV_PATH, venvDirName), sendEvent, gpuNvidia, gpuAmd, gpuName);
        continue;
      }

      // Standard Download logic
      sendEvent('progress', { id: pkg.id, status: 'active', progress: 0 });
      sendEvent('log', { text: `Preparing to download ${path.basename(pkg.dest)}...`, type: 'info' });

      const dir = path.dirname(pkg.dest);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        sendEvent('log', { text: `Created directory ${dir}`, type: 'info' });
      }

      if (fs.existsSync(pkg.dest)) {
        const stats = fs.statSync(pkg.dest);
        sendEvent('log', { text: `File ${path.basename(pkg.dest)} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB). Skipping.`, type: 'success' });
        sendEvent('progress', { id: pkg.id, status: 'done', progress: 100 });
        continue;
      }

      sendEvent('log', { text: `Downloading ${pkg.url}...`, type: 'info' });

      const response = await fetch(pkg.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${pkg.url}: ${response.statusText}`);
      }
      
      const totalBytes = parseInt(response.headers.get('content-length'), 10) || 0;
      
      const body = response.body;
      if (!body) {
         throw new Error(`Response body is null for ${pkg.url}`);
      }
      
      // Pipe with proper backpressure and progress tracking
      const fileStream = fs.createWriteStream(pkg.dest);
      let downloadedBytes = 0;
      let lastReportTime = Date.now();
      
      const webStream = Readable.fromWeb(body);
      webStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReportTime > 250) {
          const pct = totalBytes ? Math.min(Math.floor((downloadedBytes / totalBytes) * 100), 99) : 0;
          sendEvent('progress', { id: pkg.id, status: 'active', progress: pct });
          lastReportTime = now;
        }
      });
      
      try {
        await pipeline(webStream, fileStream);
      } catch (err) {
        // Clean up partial download
        try { fs.unlinkSync(pkg.dest); } catch {}
        throw new Error(`Download failed for ${path.basename(pkg.dest)}: ${err.message}`);
      }
      
      sendEvent('progress', { id: pkg.id, status: 'done', progress: 100 });
      sendEvent('log', { text: `Finished downloading ${path.basename(pkg.dest)}.`, type: 'success' });
    }

    if (!destroyed) {
      sendEvent('done', { text: 'All packages installed successfully.' });
      // Wait briefly so the browser processes the done event before the
      // connection closes — prevents spurious EventSource "error" on close.
      await new Promise(r => setTimeout(r, 300));
    }
    res.end();

  } catch (error) {
    console.error('Setup download error:', error);
    if (!destroyed) {
      sendEvent('error', { text: error.message });
      await new Promise(r => setTimeout(r, 300));
    }
    res.end();
  } finally {
    clearInterval(keepalive);
    req.off('close', cleanup);
    req.off('error', cleanup);
  }
});

export default router;
