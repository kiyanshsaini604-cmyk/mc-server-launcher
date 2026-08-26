import { spawn } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(__dirname, 'node_modules', '.bin');

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const server = createServer();
      server.once('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Port timeout'));
          return;
        }
        setTimeout(check, 500);
      });
      server.once('listening', () => {
        server.close(() => resolve());
      });
      server.listen(port, '127.0.0.1');
    };
    check();
  });
}

// On Windows, the .bin files are .cmd files - we need to use them with cmd.exe but fix the PATH
const isWin = process.platform === 'win32';

// Build a clean PATH that works
const cleanPath = [
  path.join(__dirname, 'node_modules', '.bin'),
  'C:\\Program Files\\Git\\mingw64\\bin',
  'C:\\Program Files\\Git\\usr\\bin',
  'C:\\Program Files\\nodejs',
  'C:\\WINDOWS\\system32',
  'C:\\WINDOWS',
  'C:\\WINDOWS\\System32\\Wbem',
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0',
  'C:\\WINDOWS\\System32\\OpenSSH',
  process.env.USERPROFILE + '\\AppData\\Roaming\\npm',
].join(';');

function runVite() {
  const env = { ...process.env, PATH: cleanPath };
  if (isWin) {
    return spawn('cmd.exe', ['/c', 'vite'], {
      cwd: __dirname,
      stdio: 'inherit',
      env,
    });
  }
  return spawn(path.join(bin, 'vite'), [], {
    cwd: __dirname,
    stdio: 'inherit',
    env,
  });
}

function runElectron() {
  const env = { ...process.env, PATH: cleanPath, NODE_ENV: 'development' };
  if (isWin) {
    return spawn('cmd.exe', ['/c', 'electron .'], {
      cwd: __dirname,
      stdio: 'inherit',
      env,
    });
  }
  return spawn(path.join(bin, 'electron'), ['.'], {
    cwd: __dirname,
    stdio: 'inherit',
    env,
  });
}

console.log('Starting Vite dev server...');
const vite = runVite();

(async () => {
  try {
    await waitForPort(5173);
    console.log('Vite ready! Starting Electron...');
    const electron = runElectron();

    electron.on('close', () => { vite.kill(); process.exit(0); });
    vite.on('close', () => { electron.kill(); process.exit(0); });
    process.on('SIGINT', () => { vite.kill(); electron.kill(); process.exit(0); });
  } catch (err) {
    console.error('Failed to start:', err.message);
    vite.kill();
    process.exit(1);
  }
})();
