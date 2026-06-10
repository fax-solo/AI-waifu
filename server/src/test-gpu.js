import { spawn } from 'child_process';

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
          name: null,
          code
        });
      }
    });
    proc.on('error', (err) => {
      resolve({
        hasNvidia: false,
        name: null,
        error: err.message
      });
    });
  });
}

const info = await getGpuInfo();
console.log(JSON.stringify(info, null, 2));
