import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { execSync, exec } from 'child_process';
import * as os from 'os';
import net from 'net';
import { downloadServerJar, downloadFromModrinth, ModrinthPack } from './downloaders';
import { getSafeRamLimits } from './mc-launcher';
import { isCloudConfigured, configureCloud, getCloudStatus, listCloudFiles, uploadToCloud, downloadFromCloud, uploadDirToCloud, deleteCloudFile } from './cloud-storage';

let mainWindow: BrowserWindow | null = null;
const serverProcesses: Map<string, ChildProcess> = new Map();
const consoleBuffers: Map<string, string[]> = new Map();

// Server data directory
const DATA_DIR = path.join(app.getPath('userData'), 'servers');
const DEFAULTS_DIR = path.join(app.getPath('userData'), 'defaults');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getServerConfigPath(id: string): string {
  return path.join(DATA_DIR, id, 'server.json');
}

function getServerDir(id: string): string {
  return path.join(DATA_DIR, id, 'server');
}

// ---- Defaults System ----
function ensureDefaultsDir() {
  if (!fs.existsSync(DEFAULTS_DIR)) {
    fs.mkdirSync(DEFAULTS_DIR, { recursive: true });
  }
}

function getDefaultsConfigPath(): string {
  return path.join(DEFAULTS_DIR, 'defaults.json');
}

function loadDefaultsConfig(): any {
  ensureDefaultsDir();
  const configPath = getDefaultsConfigPath();
  if (!fs.existsSync(configPath)) return { resourcePacks: [], shaderPacks: [], mods: [] };
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}



/**
 * Deploy default resource packs, shaders, and mods from Modrinth.
 * Downloads the correct version for the target MC version.
 */
async function deployDefaults(
  serverDir: string,
  mcVersion: string,
  modLoader: string,
  onProgress?: (msg: string) => void,
): Promise<string[]> {
  const config = loadDefaultsConfig();
  const deployed: string[] = [];

  const report = (msg: string) => {
    onProgress?.(msg);
    mainWindow?.webContents.send('server:download-progress', msg);
  };

  // Download matching resource packs from Modrinth
  const destResourcePacks = path.join(serverDir, 'resourcepacks');
  for (const pack of (config.resourcePacks || []) as ModrinthPack[]) {
    if (!pack.modrinthId) continue;
    try {
      report(`📦 Downloading ${pack.label} for MC ${mcVersion}...`);
      const filename = await downloadFromModrinth(
        pack.modrinthId, mcVersion, destResourcePacks, 'resourcepack',
        undefined,
      );
      deployed.push(`resourcepack: ${pack.label} (${filename})`);
    } catch (err: any) {
      report(`⚠️ Failed to download ${pack.label}: ${err.message}`);
    }
  }

  // Download matching shader packs from Modrinth
  const destShaderPacks = path.join(serverDir, 'shaderpacks');
  for (const pack of (config.shaderPacks || []) as ModrinthPack[]) {
    if (!pack.modrinthId) continue;
    try {
      report(`🎨 Downloading ${pack.label} for MC ${mcVersion}...`);
      const filename = await downloadFromModrinth(
        pack.modrinthId, mcVersion, destShaderPacks, 'shader',
        undefined,
      );
      deployed.push(`shaderpack: ${pack.label} (${filename})`);
    } catch (err: any) {
      report(`⚠️ Failed to download ${pack.label}: ${err.message}`);
    }
  }

  // Download matching mods from Modrinth (only for compatible mod loaders)
  const destMods = path.join(serverDir, 'mods');
  for (const mod of (config.mods || []) as ModrinthPack[]) {
    if (!mod.modrinthId) continue;
    // Filter by mod loader if specified
    if (mod.modLoader && mod.modLoader.length > 0 && !mod.modLoader.includes(modLoader)) {
      continue;
    }
    try {
      report(`🔧 Downloading ${mod.label} for MC ${mcVersion}...`);
      const filename = await downloadFromModrinth(
        mod.modrinthId, mcVersion, destMods, 'mod',
        modLoader,
      );
      deployed.push(`mod: ${mod.label} (${filename})`);
    } catch (err: any) {
      report(`⚠️ Failed to download ${mod.label}: ${err.message}`);
    }
  }

  return deployed;
}

// ---- Java Detection ----
function findJava(): { path: string; version: string; is64Bit: boolean } | null {
  const platform = os.platform();
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    // 1. Windows Registry (most reliable on Windows)
    try {
      const regKeys = [
        'HKLM\\SOFTWARE\\JavaSoft\\JDK',
        'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK',
        'HKLM\\SOFTWARE\\Eclipse Temurin\\JDK',
      ];
      for (const key of regKeys) {
        try {
          const { spawnSync } = require('child_process');
          const r = spawnSync('C:\\Windows\\System32\\reg.exe', ['query', key, '/s'], { encoding: 'utf-8', timeout: 5000 });
          const output = (r.stdout || '') + (r.stderr || '');
          const javaHomeMatch = output.match(/JavaHome\s+REG_SZ\s+(.+)/i) || output.match(/Path\s+REG_SZ\s+(.+)/i);
          if (javaHomeMatch) {
            const javaHome = javaHomeMatch[1].trim();
            possiblePaths.push(path.join(javaHome, 'bin', 'java.exe'));
          }
        } catch {}
      }
    } catch {}

    // 2. JAVA_HOME
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      possiblePaths.push(path.join(javaHome, 'bin', 'java.exe'));
    }

    // 3. where java (PATH)
    try {
      const { spawnSync } = require('child_process');
      const wr = spawnSync('C:\\Windows\\System32\\where.exe', ['java'], { encoding: 'utf-8', timeout: 5000 });
      const where = (wr.stdout || '').trim();
      if (where) {
        possiblePaths.unshift(...where.split('\n').map((l: string) => l.trim()).filter(Boolean));
      }
    } catch {}

    // 4. Hardcoded scan of common Windows locations
    const driveRoots = ['C:', 'D:', 'E:'];
    const programDirs = ['Program Files', 'Program Files (x86)'];
    const vendorDirs = ['Eclipse Adoptium', 'Eclipse Temurin', 'Azul', 'Java', 'Microsoft', 'BellSoft', 'Amazon Corretto', 'Zulu'];
    for (const drive of driveRoots) {
      for (const prog of programDirs) {
        for (const vendor of vendorDirs) {
          const vendorPath = drive + path.sep + prog + path.sep + vendor;
          try {
            if (fs.existsSync(vendorPath)) {
              const versions = fs.readdirSync(vendorPath).filter(f => f.startsWith('jdk-') || f.startsWith('jre-'));
              for (const v of versions) {
                const jp = vendorPath + path.sep + v + path.sep + 'bin' + path.sep + 'java.exe';
                if (fs.existsSync(jp)) possiblePaths.push(jp);
              }
            }
          } catch {}
        }
      }
    }

    // 5. ProgramFiles env vars
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || '';
    for (const base of [pf, pf86].filter(Boolean)) {
      for (const vendor of vendorDirs) {
        const vendorPath = base + path.sep + vendor;
        try {
          if (fs.existsSync(vendorPath)) {
            const versions = fs.readdirSync(vendorPath).filter(f => f.startsWith('jdk-') || f.startsWith('jre-'));
            for (const v of versions) {
              const jp = vendorPath + path.sep + v + path.sep + 'bin' + path.sep + 'java.exe';
              if (fs.existsSync(jp)) possiblePaths.push(jp);
            }
          }
        } catch {}
      }
    }
  } else {
    // macOS / Linux
    const home = os.homedir();
    possiblePaths.push(
      '/usr/bin/java',
      '/usr/local/bin/java',
      path.join(home, '.sdkman/candidates/java/current/bin/java'),
      '/Library/Java/JavaVirtualMachines/Contents/Home/bin/java',
    );
    try {
      const which = execSync('which java 2>/dev/null', { encoding: 'utf-8' }).trim();
      if (which) possiblePaths.unshift(which);
    } catch {}
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniquePaths = possiblePaths.filter(p => {
    const lower = p.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  for (const javaPath of uniquePaths) {
    if (!fs.existsSync(javaPath)) continue;
    try {
      // Use spawnSync to avoid shell redirect issues
      const { spawnSync } = require('child_process');
      const result = spawnSync(javaPath, ['-version'], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      const output = (result.stdout || '') + (result.stderr || '');
      const versionMatch = output.match(/version\s+"?(\d+[\d._]*)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      const is64Bit = output.includes('64-Bit') || output.includes('aarch64');
      return { path: javaPath, version, is64Bit };
    } catch {}
  }
  return null;
}

// ---- Port Check ----
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}



// ---- IPC Handlers ----
function registerIPC() {
  // Java
  ipcMain.handle('java:find', () => findJava());

  ipcMain.handle('java:install', async () => {
    // Open Adoptium download page
    shell.openExternal('https://adoptium.net/temurin/releases/?version=21');
    return { success: true, message: 'Opened Adoptium download page. Install Java 21+ and restart the launcher.' };
  });

  // Servers
  ipcMain.handle('servers:list', () => {
    ensureDataDir();
    const servers: any[] = [];
    for (const id of fs.readdirSync(DATA_DIR)) {
      const configPath = getServerConfigPath(id);
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        servers.push(config);
      }
    }
    return servers;
  });

  ipcMain.handle('servers:get', (_, id: string) => {
    const configPath = getServerConfigPath(id);
    if (!fs.existsSync(configPath)) throw new Error('Server not found');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  });

  ipcMain.handle('servers:create', async (_, config: any) => {
    ensureDataDir();
    const id = config.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const serverDir = getServerDir(id);
    fs.mkdirSync(serverDir, { recursive: true });

    const fullConfig = {
      ...config,
      id,
      path: serverDir,
      createdAt: new Date().toISOString(),
      properties: config.properties || {},
      jvmArgs: config.jvmArgs || ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200'],
    };

    fs.writeFileSync(getServerConfigPath(id), JSON.stringify(fullConfig, null, 2));

    // Accept EULA
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');

    // Download server jar
    try {
      const jarPath = path.join(serverDir, 'server.jar');
      const requiredJava = requiredJavaForMcVersion(config.version);
      const java = await ensureJavaRuntime(requiredJava).catch(() => null);
      await downloadServerJar(
        config.modLoader,
        config.version,
        jarPath,
        serverDir,
        java || '',
        mainWindow,
      );

      // Deploy default resource packs, shaders, and mods from Modrinth
      const deployed = await deployDefaults(serverDir, config.version, config.modLoader);
      fullConfig.deployedDefaults = deployed;

      // Generate default server.properties (includes resource packs)
      const props = generateServerProperties(fullConfig, serverDir);
      fs.writeFileSync(path.join(serverDir, 'server.properties'), props);
    } catch (err: any) {
      return { success: false, error: err.message };
    }

    return { success: true, config: fullConfig };
  });

  ipcMain.handle('servers:delete', (_, id: string) => {
    const serverDir = path.join(DATA_DIR, id);
    if (fs.existsSync(serverDir)) {
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
    return { success: true };
  });

  ipcMain.handle('servers:start', async (_, id: string) => {
    if (serverProcesses.has(id)) throw new Error('Server already running');

    const config = JSON.parse(fs.readFileSync(getServerConfigPath(id), 'utf-8'));
    const serverDir = getServerDir(id);
    const jarPath = path.join(serverDir, 'server.jar');

    if (!fs.existsSync(jarPath)) throw new Error('server.jar not found. Please reinstall.');

    // Pick the RIGHT Java version for this MC version (auto-downloads if missing)
    const requiredJava = requiredJavaForMcVersion(config.version);
    const javaExe = await ensureJavaRuntime(requiredJava, (msg) => {
      mainWindow?.webContents.send('server:console', id, { timestamp: new Date().toISOString(), message: msg, level: 'info' });
    }).catch(() => null);
    if (!javaExe) throw new Error(`Java ${requiredJava}+ is required for MC ${config.version}. Could not find or download it.`);

    // Cap RAM to safe limits (prevent "paging file too small" crash)
    const safe = getSafeRamLimits();
    const ramMin = safe.min;
    const ramMax = safe.max;

    const args = [
      ...config.jvmArgs,
      `-Xms${ramMin}`,
      `-Xmx${ramMax}`,
      '-jar', jarPath,
      'nogui',
    ];

    const child = spawn(javaExe, args, {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcesses.set(id, child);
    consoleBuffers.set(id, []);

    const broadcast = (msg: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') => {
      const line = { timestamp: new Date().toISOString(), message: msg, level };
      const buffer = consoleBuffers.get(id) || [];
      buffer.push(JSON.stringify(line));
      if (buffer.length > 5000) buffer.shift();
      consoleBuffers.set(id, buffer);
      mainWindow?.webContents.send('server:console', id, line);
    };

    broadcast(`RAM: ${ramMin} - ${ramMax} (auto-capped)`);

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const level = line.includes('[ERROR]') || line.includes('Exception') ? 'error'
          : line.includes('[WARN]') ? 'warn'
          : line.includes('[DEBUG]') ? 'debug' : 'info';
        broadcast(line, level);
      }
    });

    child.stderr?.on('data', (data) => {
      broadcast(data.toString().trim(), 'error');
    });

    child.on('close', (code) => {
      serverProcesses.delete(id);
      broadcast(`Server stopped with exit code ${code}`, 'info');
      mainWindow?.webContents.send('server:status', id, { running: false });
    });

    child.on('error', (err) => {
      serverProcesses.delete(id);
      broadcast(`Server error: ${err.message}`, 'error');
      mainWindow?.webContents.send('server:status', id, { running: false });
    });

    mainWindow?.webContents.send('server:status', id, { running: true });
    return { success: true };
  });

  ipcMain.handle('servers:stop', (_, id: string) => {
    const proc = serverProcesses.get(id);
    if (proc) {
      proc.stdin?.write('stop\n');
      setTimeout(() => {
        if (serverProcesses.has(id)) {
          proc.kill();
          serverProcesses.delete(id);
        }
      }, 10000);
    }
    return { success: true };
  });

  ipcMain.handle('servers:command', (_, id: string, command: string) => {
    const proc = serverProcesses.get(id);
    if (proc && proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(command + '\n');
      return { success: true };
    }
    throw new Error('Server not running');
  });

  ipcMain.handle('servers:get-info', async (_, id: string) => {
    const config = JSON.parse(fs.readFileSync(getServerConfigPath(id), 'utf-8'));
    const running = serverProcesses.has(id);

    // Get local IP
    let localIP = '127.0.0.1';
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
        }
      }
    }

    // Get public IP (with timeout)
    let publicIP = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json() as any;
      publicIP = data.ip || '';
    } catch {}

    // Get online players from console buffer
    let onlinePlayers: string[] = [];
    if (running) {
      const buffer = consoleBuffers.get(id) || [];
      // Look for list command output in recent lines
      const lines = buffer.slice(-200);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.message?.includes('There are') && parsed.message?.includes('of a max')) {
          // e.g. "There are 3 of a max of 100 players online: Steve, Alex, ..."
          const match = parsed.message.match(/online:(.+)/);
          if (match) {
            onlinePlayers = match[1].split(',').map((n: string) => n.trim()).filter(Boolean);
          }
        }
      }
    }

    return {
      localIP,
      publicIP,
      port: config.port || 25565,
      running,
      onlinePlayers,
      maxPlayers: config.maxPlayers || 20,
      motd: config.motd || 'A Minecraft Server',
      version: config.version,
      modLoader: config.modLoader,
    };
  });

  ipcMain.handle('servers:console:get', (_, id: string) => {
    return (consoleBuffers.get(id) || []).map(l => JSON.parse(l));
  });

  ipcMain.handle('servers:status', (_, id: string) => {
    const proc = serverProcesses.get(id);
    return { running: !!proc, pid: proc?.pid || null };
  });

  ipcMain.handle('servers:config:save', (_, id: string, config: any) => {
    const configPath = getServerConfigPath(id);
    if (!fs.existsSync(configPath)) throw new Error('Server not found');
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const merged = { ...existing, ...config };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));

    // Update server.properties
    const serverDir = getServerDir(id);
    const props = generateServerProperties(merged, serverDir);
    fs.writeFileSync(path.join(serverDir, 'server.properties'), props);

    return { success: true };
  });

  ipcMain.handle('servers:logs', (_, id: string) => {
    const logPath = path.join(getServerDir(id), 'logs', 'latest.log');
    if (!fs.existsSync(logPath)) return '';
    return fs.readFileSync(logPath, 'utf-8');
  });

  // Mods management
  ipcMain.handle('mods:list', (_, id: string) => {
    const modsDir = path.join(getServerDir(id), 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
      return [];
    }
    return fs.readdirSync(modsDir)
      .filter(f => f.endsWith('.jar'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(modsDir, f)).size,
        modified: fs.statSync(path.join(modsDir, f)).mtime.toISOString(),
      }));
  });

  ipcMain.handle('mods:upload', async (_, id: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Mods/Plugins',
      filters: [{ name: 'JAR Files', extensions: ['jar'] }],
      properties: ['openFile', 'multiSelections'],
    });

    if (!result.canceled) {
      const modsDir = path.join(getServerDir(id), 'mods');
      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

      for (const filePath of result.filePaths) {
        const fileName = path.basename(filePath);
        fs.copyFileSync(filePath, path.join(modsDir, fileName));
      }
      return { success: true, count: result.filePaths.length };
    }
    return { success: false };
  });

  ipcMain.handle('mods:delete', (_, id: string, modName: string) => {
    const modPath = path.join(getServerDir(id), 'mods', modName);
    if (fs.existsSync(modPath)) fs.unlinkSync(modPath);
    return { success: true };
  });

  // Players
  ipcMain.handle('players:list', (_, id: string) => {
    const opsPath = path.join(getServerDir(id), 'ops.json');
    const whitelistPath = path.join(getServerDir(id), 'whitelist.json');
    const bannedPath = path.join(getServerDir(id), 'banned-players.json');

    const readJson = (p: string) => {
      try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : []; }
      catch { return []; }
    };

    return {
      ops: readJson(opsPath),
      whitelist: readJson(whitelistPath),
      banned: readJson(bannedPath),
    };
  });

  ipcMain.handle('players:ban', (_, id: string, uuid: string) => {
    const proc = serverProcesses.get(id);
    if (proc) {
      proc.stdin?.write(`ban ${uuid}\n`);
    }
    return { success: true };
  });

  ipcMain.handle('players:pardon', (_, id: string, uuid: string) => {
    const proc = serverProcesses.get(id);
    if (proc) {
      proc.stdin?.write(`pardon ${uuid}\n`);
    }
    return { success: true };
  });

  ipcMain.handle('players:kick', (_, id: string, name: string) => {
    const proc = serverProcesses.get(id);
    if (proc) {
      proc.stdin?.write(`kick ${name}\n`);
    }
    return { success: true };
  });

  // System
  ipcMain.handle('system:openFolder', (_, id: string) => {
    shell.openPath(getServerDir(id));
  });

  ipcMain.handle('system:check-port', (_, port: number) => isPortAvailable(port));

  // Versions
  ipcMain.handle('versions:fetch', async () => {
    const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    const manifest = await res.json() as any;
    return manifest.versions.map((v: any) => ({
      id: v.id,
      type: v.type,
      releaseTime: v.releaseTime,
    }));
  });

  // Backup / Restore
  ipcMain.handle('servers:backup', async (_, id: string) => {
    const serverDir = getServerDir(id);
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Server Backup',
      defaultPath: `backup-${id}-${Date.now()}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };

    // Simple backup: copy server dir contents to a temp dir then zip via tar
    try {
      const { spawnSync } = await import('child_process');
      if (os.platform() === 'win32') {
        const r = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          ['-NoProfile', '-Command', `Compress-Archive -Path '${serverDir}\*' -DestinationPath '${result.filePath}' -Force`],
          { timeout: 300000, stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Backup failed (exit ${r.status})`);
      } else {
        const r = spawnSync('zip', ['-r', result.filePath, '.'], { cwd: serverDir, timeout: 300000, stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Backup failed (exit ${r.status})`);
      }
      return { success: true, path: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('servers:restore', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restore Server from Backup',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };

    const zipPath = result.filePaths[0];
    ensureDataDir();
    const id = 'restored-' + Date.now();
    const serverDir = getServerDir(id);
    fs.mkdirSync(serverDir, { recursive: true });

    try {
      const { spawnSync } = await import('child_process');
      if (os.platform() === 'win32') {
        const r = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${serverDir}' -Force`],
          { timeout: 300000, stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Restore failed (exit ${r.status})`);
      } else {
        const r = spawnSync('unzip', ['-o', zipPath, '-d', serverDir], { timeout: 300000, stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Restore failed (exit ${r.status})`);
      }

      // Try to read existing server.json from the backup
      const configPath = path.join(serverDir, 'server.json');
      let config;
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.id = id;
        config.path = serverDir;
      } else {
        config = {
          id,
          name: path.basename(zipPath, '.zip'),
          path: serverDir,
          version: 'unknown',
          modLoader: 'vanilla',
          port: 25565,
          maxPlayers: 20,
          ram: { min: '1G', max: '4G' },
          motd: 'Restored Server',
          gamemode: 'survival',
          difficulty: 'normal',
          whitelist: false,
          onlineMode: true,
          pvp: true,
          spawnProtection: 16,
          viewDistance: 10,
          properties: {},
          jvmArgs: ['-XX:+UseG1GC'],
          createdAt: new Date().toISOString(),
        };
      }
      fs.writeFileSync(getServerConfigPath(id), JSON.stringify(config, null, 2));
      return { success: true, config };
    } catch (err: any) {
      fs.rmSync(serverDir, { recursive: true, force: true });
      return { success: false, error: err.message };
    }
  });

  // Defaults management
  ipcMain.handle('defaults:list', () => {
    return loadDefaultsConfig();
  });

  ipcMain.handle('defaults:get-deployed', (_, id: string) => {
    const configPath = getServerConfigPath(id);
    if (!fs.existsSync(configPath)) return [];
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.deployedDefaults || [];
  });

  ipcMain.handle('defaults:deploy', async (_, id: string) => {
    const configPath = getServerConfigPath(id);
    if (!fs.existsSync(configPath)) throw new Error('Server not found');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const serverDir = getServerDir(id);
    const deployed = await deployDefaults(serverDir, config.version, config.modLoader);
    config.deployedDefaults = deployed;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true, deployed };
  });

  ipcMain.handle('defaults:deploy-all', async () => {
    ensureDataDir();
    const results: any[] = [];
    for (const id of fs.readdirSync(DATA_DIR)) {
      const configPath = getServerConfigPath(id);
      if (!fs.existsSync(configPath)) continue;
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const serverDir = getServerDir(id);
      const deployed = await deployDefaults(serverDir, config.version, config.modLoader);
      if (deployed.length > 0) {
        config.deployedDefaults = [...(config.deployedDefaults || []), ...deployed];
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        results.push({ server: config.name, deployed });
      }
    }
    return { success: true, results };
  });

  ipcMain.handle('defaults:upload', async (_, type: 'resourcepacks' | 'shaderpacks' | 'mods') => {
    const filters = type === 'mods'
      ? [{ name: 'JAR Files', extensions: ['jar'] }]
      : [{ name: 'ZIP Files', extensions: ['zip'] }];
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: `Add Default ${type === 'mods' ? 'Mods' : type === 'shaderpacks' ? 'Shader Packs' : 'Resource Packs'}`,
      filters,
      properties: ['openFile', 'multiSelections'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      ensureDefaultsDir();
      const destDir = path.join(DEFAULTS_DIR, type);
      fs.mkdirSync(destDir, { recursive: true });
      for (const filePath of result.filePaths) {
        fs.copyFileSync(filePath, path.join(destDir, path.basename(filePath)));
      }
      return { success: true, count: result.filePaths.length };
    }
    return { success: false };
  });

  ipcMain.handle('defaults:remove', (_, type: string, file: string) => {
    const filePath = path.join(DEFAULTS_DIR, type, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  });

  // System info
  ipcMain.handle('system:info', () => ({
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    hostname: os.hostname(),
    uptime: os.uptime(),
  }));

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());
}

// ---- Helper ----
function generateServerProperties(config: any, serverDir?: string): string {
  const props: Record<string, string> = {
    'server-port': String(config.port || 25565),
    'max-players': String(config.maxPlayers || 20),
    'motd': config.motd || 'A Minecraft Server',
    'gamemode': config.gamemode || 'survival',
    'difficulty': config.difficulty || 'normal',
    'white-list': String(config.whitelist || false),
    'online-mode': 'false',
    'pvp': String(config.pvp ?? true),
    'spawn-protection': String(config.spawnProtection || 16),
    'view-distance': String(config.viewDistance || 10),
    'level-name': 'world',
    'level-type': 'minecraft\\:normal',
    'enable-command-block': 'true',
    'spawn-npcs': 'true',
    'spawn-animals': 'true',
    'spawn-monsters': 'true',
    'generate-structures': 'true',
    'allow-nether': 'true',
    'resource-pack': '',
    'resource-pack-sha1': '',
    'level-seed': '',
    'server-ip': '0.0.0.0',
    'network-compression-threshold': '256',
    'require-resource-pack': 'false',
    'enforce-secure-profile': 'false',
    'hide-online-players': 'false',
    'entity-broadcast-range-percentage': '100',
    'sync-chunk-writes': 'true',
    'use-native-transport': 'true',
    'text-filtering-config': '',
    'log-ips': 'true',
    'rate-limit': '0',
    'previews-chat': 'false',
    'player-idle-timeout': '0',
    'allow-flight': 'false',
    'max-world-size': '29999984',
    'max-chained-neighbor-updates': '1000000',
  };

  // Merge custom properties
  if (config.properties) {
    Object.assign(props, config.properties);
  }

  // Note: resource-pack requires a URL, not a local path.
  // For local servers, clients would need to manually install packs.
  // Server resource packs in resourcepacks/ dir are ignored for serving.

  return Object.entries(props)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
}

// ---- Minecraft Client Launcher ----
import { getClientVersions, downloadClient, launchGame, isGameRunning, killGame, getGameDataDir, requiredJavaForMcVersion, ensureJavaRuntime } from './mc-launcher';

ipcMain.handle('mc:versions', async () => {
  return getClientVersions();
});

ipcMain.handle('mc:download', async (_, versionId: string) => {
  return downloadClient(versionId, (msg, pct) => {
    mainWindow?.webContents.send('mc:progress', msg, pct);
  });
});

ipcMain.handle('mc:safe-ram', () => {
  return getSafeRamLimits();
});

ipcMain.handle('mc:launch', async (_, versionId: string, username: string, javaPath: string, ramMin: string, ramMax: string) => {
  // Auto-cap RAM to prevent paging file crashes
  const safe = getSafeRamLimits();
  await launchGame(versionId, username, javaPath, ramMin || safe.min, ramMax || safe.max, mainWindow);
  return { success: true };
});

ipcMain.handle('mc:status', () => {
  return { running: isGameRunning() };
});

ipcMain.handle('mc:kill', () => {
  killGame();
  return { success: true };
});

ipcMain.handle('mc:game-dir', () => {
  return getGameDataDir();
});

// ---- Cloud Storage ----
ipcMain.handle('cloud:status', () => getCloudStatus());
ipcMain.handle('cloud:configure', (_, creds: any) => configureCloud(creds));
ipcMain.handle('cloud:list', (_, dir: string) => listCloudFiles(dir));
ipcMain.handle('cloud:upload', async (_, localPath: string, remotePath: string) => {
  return uploadToCloud(localPath, remotePath, (loaded, total) => {
    mainWindow?.webContents.send('cloud:progress', { loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
  });
});
ipcMain.handle('cloud:download', async (_, fsId: number, localPath: string) => {
  return downloadFromCloud(fsId, localPath);
});
ipcMain.handle('cloud:upload-backup', async (_, serverId: string) => {
  const serverDir = getServerDir(serverId);
  const backupPath = path.join(serverDir, 'backup.zip');
  if (!fs.existsSync(backupPath)) throw new Error('No backup found. Create a backup first.');
  return uploadToCloud(backupPath, `/MC-Servers/${serverId}/backup.zip`, (loaded, total) => {
    mainWindow?.webContents.send('cloud:progress', { loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
  });
});
ipcMain.handle('cloud:upload-dir', async (_, serverId: string) => {
  const serverDir = getServerDir(serverId);
  return uploadDirToCloud(serverDir, `/MC-Servers/${serverId}`, (msg, pct) => {
    mainWindow?.webContents.send('cloud:progress', { message: msg, percent: pct });
  });
});
ipcMain.handle('cloud:delete', (_, remotePath: string) => deleteCloudFile(remotePath));

// ---- Window ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    backgroundColor: '#12121f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureDataDir();
  registerIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  // Kill all server processes
  for (const [id, proc] of serverProcesses) {
    try { proc.kill(); } catch {}
  }
  serverProcesses.clear();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
