import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { Readable } from 'stream';

const rawData = fs.readFileSync('models.json', 'utf8');
const cleanData = rawData.replace(/^\uFEFF/, '');
const models = JSON.parse(cleanData);

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`[OK] ${dest} already exists.`);
    return;
  }

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[Downloading] ${url} -> ${dest}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  
  const fileStream = fs.createWriteStream(dest);
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  console.log(`[Done] ${dest}`);
}

async function main() {
  try {
    for (const service in models) {
      for (const asset in models[service]) {
        const { url, path: dest } = models[service][asset];
        await downloadFile(url, dest);
      }
    }
    
    // Also ensure Electron binary is installed
    console.log('Checking Electron binary...');
    const electronDist = path.join('node_modules', 'electron', 'dist');
    if (!fs.existsSync(electronDist)) {
      console.log('[Missing] Electron binary not found. Running install script...');
      const { execSync } = await import('child_process');
      try {
        execSync('node node_modules/electron/install.js', { stdio: 'inherit' });
        console.log('[OK] Electron binary installed.');
      } catch (err) {
        console.warn('[Warning] Failed to run electron install script. You may need to run it manually.');
      }
    } else {
      console.log('[OK] Electron binary already exists.');
    }

    console.log('All models and binaries are ready!');
  } catch (err) {
    console.error('Download failed:', err);
    process.exit(1);
  }
}

main();
