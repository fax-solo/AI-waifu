import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function detectRootDir() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'models.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
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

export function resolvePythonDir(rootDir) {
  return path.join(rootDir, 'python');
}

export function resolveVenvPath(pythonDir) {
  const name = fs.existsSync(path.join(pythonDir, 'venv_py311')) ? 'venv_py311' : 'venv';
  return path.join(pythonDir, name);
}

export function resolvePythonExe(pythonDir) {
  const isWindows = process.platform === 'win32';
  const venvPath = resolveVenvPath(pythonDir);
  const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
  return path.join(binDir, isWindows ? 'python.exe' : 'python');
}
