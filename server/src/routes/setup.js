import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

const router = express.Router();

async function getGpuInfo() {
  return new Promise((resolve) => {
    const proc = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.on('close', (code) => {
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
      resolve({
        hasNvidia: false,
        name: null
      });
    });
  });
}

router.get('/status', async (req, res) => {
  try {
    // Robust root directory detection
    const isProd = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
    const rootDir = (process.platform === 'win32' && process.resourcesPath && isProd)
      ? process.resourcesPath 
      : (process.cwd().endsWith('server') ? path.join(process.cwd(), '..') : process.cwd());
      
    const pythonDir = path.join(rootDir, 'python');
    const venvPath = path.join(pythonDir, 'venv');
    const modelsPath = path.join(rootDir, 'models.json');
    
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
    const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
    const venvValid = fs.existsSync(venvPath) && fs.existsSync(binDir);

    const gpuInfo = await getGpuInfo();

    res.json({
      setupRequired: modelsMissing || !venvValid,
      modelsMissing,
      venvMissing: !venvValid,
      gpuInfo
    });
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

async function bootstrapPython(pkgId, venvPath, sendEvent, gpuNvidia, gpuAmd, gpuName) {
  const isProd = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
  const rootDir = (process.platform === 'win32' && process.resourcesPath && isProd)
    ? process.resourcesPath 
    : (process.cwd().endsWith('server') ? path.join(process.cwd(), '..') : process.cwd());
    
  const pythonDir = path.join(rootDir, 'python');
  if (!fs.existsSync(pythonDir)) fs.mkdirSync(pythonDir, { recursive: true });
  
  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
  
  sendEvent('progress', { id: pkgId, status: 'active', progress: 5 });

  if (fs.existsSync(venvPath) && !fs.existsSync(binDir)) {
    sendEvent('log', { text: `Found incompatible virtual environment (wrong OS layout). Removing...`, type: 'warning' });
    fs.rmSync(venvPath, { recursive: true, force: true });
  }
  
  if (!fs.existsSync(venvPath)) {
    sendEvent('log', { text: `Creating virtual environment in ${venvPath}...`, type: 'info' });
    let pyCmd = isWindows ? 'python' : 'python3';
    
    // Check if python is available
    let hasPython = false;
    try {
      await runCommand(pyCmd, ['--version'], pythonDir, sendEvent);
      hasPython = true;
    } catch (e) {
      sendEvent('log', { text: `System Python not found. Attempting to bootstrap portable Python...`, type: 'warning' });
    }

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
          const getPipResp = await fetch(getPipUrl);
          const getPipBuf = await getPipResp.arrayBuffer();
          const getPipPath = path.join(portablePyDir, 'get-pip.py');
          fs.writeFileSync(getPipPath, Buffer.from(getPipBuf));
          await runCommand(pyCmd, [getPipPath], portablePyDir, sendEvent);
          fs.unlinkSync(getPipPath);
        }
      }
    }

    try {
      await runCommand(pyCmd, ['-m', 'venv', 'venv'], pythonDir, sendEvent);
    } catch (e) {
      if (isWindows && !hasPython) {
        sendEvent('log', { text: `Creating venv with portable Python...`, type: 'info' });
        // For embeddable python, we might just use the runtime dir as venv or copy it
        // Simpler: Just use the runtime dir as the "venv"
        pyCmd = path.join(pythonDir, 'runtime', 'python.exe');
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
    
  let fakeProgress = 20;
  const advanceProgress = () => {
    fakeProgress += 0.5;
    if (fakeProgress > 95) fakeProgress = 95;
    sendEvent('progress', { id: pkgId, status: 'active', progress: Math.floor(fakeProgress) });
  };
  
  let engineName = 'CPU';
  if (gpuNvidia) engineName = `NVIDIA GPU: ${gpuName || 'Unknown'}`;
  else if (gpuAmd) engineName = `AMD GPU: ${gpuName || 'Unknown'}`;
  
  sendEvent('log', { text: `Installing ONNX Runtime (${engineName})...`, type: 'info' });
  
  if (gpuNvidia) {
    await runCommand(pipCmd, ['uninstall', '-y', 'onnxruntime'], pythonDir, sendEvent);
    const gpuDeps = [
      'nvidia-cublas-cu12', 
      'nvidia-cudnn-cu12', 
      'nvidia-cufft-cu12',
      'nvidia-curand-cu12',
      'nvidia-cusparse-cu12',
      'onnxruntime-gpu'
    ];
    await runCommand(pipCmd, ['install', ...gpuDeps], pythonDir, sendEvent, advanceProgress);
  } else if (gpuAmd) {
    await runCommand(pipCmd, ['uninstall', '-y', 'onnxruntime'], pythonDir, sendEvent);
    if (process.platform === 'win32') {
      await runCommand(pipCmd, ['install', 'onnxruntime-directml'], pythonDir, sendEvent, advanceProgress);
    } else {
      await runCommand(pipCmd, ['install', 'onnxruntime-rocm', '--extra-index-url', 'https://download.onnxruntime.ai/onnxruntime_stable_rocm.html'], pythonDir, sendEvent, advanceProgress);
    }
  } else {
    await runCommand(pipCmd, ['install', 'onnxruntime'], pythonDir, sendEvent, advanceProgress);
  }
  
  sendEvent('log', { text: `Installing TTS dependencies (kokoro-onnx, fastapi, uvicorn, soundfile)...`, type: 'info' });
  const deps = ['fastapi', 'uvicorn', 'soundfile', 'kokoro-onnx'];
  await runCommand(pipCmd, ['install', ...deps], pythonDir, sendEvent, advanceProgress);
  
  if (gpuNvidia || gpuAmd) {
    sendEvent('log', { text: `Cleaning up conflicting CPU packages...`, type: 'info' });
    await runCommand(pipCmd, ['uninstall', '-y', 'onnxruntime'], pythonDir, sendEvent);
  }
  
  sendEvent('progress', { id: pkgId, status: 'done', progress: 100 });
  sendEvent('log', { text: `Python Environment successfully bootstrapped!`, type: 'success' });
}

async function checkVCRedist(sendEvent) {
  if (os.platform() !== 'win32') return;
  
  // Check if VC++ Redist is likely installed by looking for a common DLL
  const system32 = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
  const hasVC = fs.existsSync(path.join(system32, 'vcruntime140.dll')) || 
                fs.existsSync(path.join(system32, 'msvcp140.dll'));

  if (!hasVC) {
    sendEvent('log', { text: `⚠️ Potential Issue: Microsoft Visual C++ Redistributable not detected.`, type: 'warning' });
    sendEvent('log', { text: `AI models and Python require this to run. Downloading installer...`, type: 'info' });
    
    const vcUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
    const dest = path.join(process.cwd(), '..', 'python', 'vc_redist.x64.exe');
    
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    
    const response = await fetch(vcUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    sendEvent('log', { text: `✅ Downloaded. Please run 'python/vc_redist.x64.exe' to fix AI errors.`, type: 'success' });
    sendEvent('log', { text: `(The app will continue, but may crash if you don't install it!)`, type: 'warning' });
  }
}

router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const isProd = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
    const rootDir = (process.platform === 'win32' && process.resourcesPath && isProd)
      ? process.resourcesPath 
      : (process.cwd().endsWith('server') ? path.join(process.cwd(), '..') : process.cwd());
      
    const modelsPath = path.join(rootDir, 'models.json');
    const VENV_PATH = path.join(rootDir, 'python');
    
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

    const targetPackages = requested.length > 0 
      ? allPkgs.filter(p => requested.includes(p.id)) 
      : allPkgs;

    sendEvent('log', { text: `Starting setup sequence for ${targetPackages.length} packages...`, type: 'info' });

    // Check for Windows dependencies
    await checkVCRedist(sendEvent);

    for (const pkg of targetPackages) {
      if (pkg.type === 'python-env') {
        await bootstrapPython(pkg.id, path.join(VENV_PATH, 'venv'), sendEvent, gpuNvidia, gpuAmd, gpuName);
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
      let downloadedBytes = 0;
      
      const fileStream = fs.createWriteStream(pkg.dest);
      const body = response.body;
      
      if (!body) {
         throw new Error(`Response body is null for ${pkg.url}`);
      }
      
      let lastReportTime = Date.now();
      
      for await (const chunk of body) {
        fileStream.write(chunk);
        downloadedBytes += chunk.length;
        
        const now = Date.now();
        if (now - lastReportTime > 250) {
          const pct = totalBytes ? Math.min(Math.floor((downloadedBytes / totalBytes) * 100), 99) : 0;
          sendEvent('progress', { id: pkg.id, status: 'active', progress: pct });
          lastReportTime = now;
        }
      }
      
      fileStream.end();
      sendEvent('progress', { id: pkg.id, status: 'done', progress: 100 });
      sendEvent('log', { text: `Finished downloading ${path.basename(pkg.dest)}.`, type: 'success' });
    }

    sendEvent('done', { text: 'All packages installed successfully.' });
    res.end();

  } catch (error) {
    console.error('Setup download error:', error);
    sendEvent('error', { text: error.message });
    res.end();
  }
});

export default router;
