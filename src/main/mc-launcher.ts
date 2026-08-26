import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import { Readable } from 'stream';
import { BrowserWindow } from 'electron';

type ProgressCallback = (message: string, percent?: number) => void;

const USER_AGENT = 'MCServerLauncher/1.0.0';
const MC_DATA_DIR = path.join(os.homedir(), '.mc-launcher-data');

// ---- Fetch helpers ----
async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function downloadFile(url: string, destPath: string, onProgress?: ProgressCallback): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);

  const totalBytes = Number(res.headers.get('content-length') || 0);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const writer = fs.createWriteStream(destPath);
  let downloaded = 0;

  return new Promise((resolve, reject) => {
    const nodeStream = Readable.fromWeb(res.body as any);
    nodeStream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      writer.write(chunk);
      if (onProgress && totalBytes > 0) {
        const pct = Math.round((downloaded / totalBytes) * 100);
        onProgress(`Downloading... ${(downloaded / 1048576).toFixed(1)} MB / ${(totalBytes / 1048576).toFixed(1)} MB`, pct);
      }
    });
    nodeStream.on('error', (err: Error) => { writer.destroy(); reject(err); });
    // Resolve on writer 'close' so the file is fully flushed to disk
    writer.on('error', (err: Error) => reject(err));
    writer.on('close', () => resolve());
    nodeStream.on('end', () => writer.end());
  });
}

async function sha1(filePath: string): Promise<string> {
  const { createHash } = await import('crypto');
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ---- Version manifest ----
interface MCVersion {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
}

interface MCVersionDetail {
  id: string;
  type: string;
  downloads: {
    client: { sha1: string; size: number; url: string };
    server: { sha1: string; size: number; url: string };
  };
  libraries: MCLibrary[];
  assets: string;
  assetIndex: { id: string; sha1: string; size: number; url: string };
  mainClass: string;
  arguments?: { game?: any[]; jvm?: any[] };
  minecraftArguments?: string;
  javaVersion?: { component: string; majorVersion: number };
}

interface MCLibrary {
  name: string;
  downloads?: {
    artifact?: { path: string; sha1: string; size: number; url: string };
  };
  rules?: { action: string; os?: { name: string }; features?: Record<string, boolean> }[];
}

// ---- Cache for version manifest ----
let manifestCache: { versions: MCVersion[]; timestamp: number } | null = null;

export async function getClientVersions(): Promise<MCVersion[]> {
  if (manifestCache && Date.now() - manifestCache.timestamp < 600000) {
    return manifestCache.versions;
  }
  const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  manifestCache = { versions: manifest.versions, timestamp: Date.now() };
  return manifest.versions;
}

export async function getVersionDetail(versionId: string): Promise<MCVersionDetail> {
  const versions = await getClientVersions();
  const v = versions.find((x: MCVersion) => x.id === versionId);
  if (!v) throw new Error(`Version ${versionId} not found`);
  return fetchJSON(v.url);
}

// ---- Download client files ----
export async function downloadClient(
  versionId: string,
  onProgress?: ProgressCallback,
): Promise<{ clientDir: string; mainClass: string; javaVersion: number }> {
  const clientDir = path.join(MC_DATA_DIR, 'versions', versionId);
  const librariesDir = path.join(MC_DATA_DIR, 'libraries');
  const assetsDir = path.join(MC_DATA_DIR, 'assets');

  onProgress?.(`Fetching version info for ${versionId}...`);
  const detail = await getVersionDetail(versionId);

  // 1. Download client jar
  const clientJar = path.join(clientDir, `${versionId}.jar`);
  if (!fs.existsSync(clientJar)) {
    onProgress?.('Downloading client JAR...');
    await downloadFile(detail.downloads.client.url, clientJar, onProgress);
  } else {
    onProgress?.('Client JAR already downloaded');
  }

  // 2. Download asset index
  const assetIndexPath = path.join(assetsDir, 'indexes', `${detail.assetIndex.id}.json`);
  if (!fs.existsSync(assetIndexPath)) {
    onProgress?.('Downloading asset index...');
    await downloadFile(detail.assetIndex.url, assetIndexPath);
  }

  // 3. Download libraries
  let downloadedLibs = 0;
  const totalLibs = detail.libraries.filter(l => l.downloads?.artifact).length;
  const platform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'osx' : 'linux';

  for (const lib of detail.libraries) {
    // Check rules
    if (lib.rules && lib.rules.length > 0) {
      const allowed = lib.rules.some(r => {
        if (r.action === 'disallow') {
          if (r.os?.name && r.os.name !== platform) return true;
          return false;
        }
        if (r.os?.name && r.os.name !== platform) return false;
        return true;
      });
      if (!allowed) continue;
    }

    if (!lib.downloads?.artifact) continue;

    const artifact = lib.downloads.artifact;
    const libPath = path.join(librariesDir, artifact.path);

    if (!fs.existsSync(libPath)) {
      downloadedLibs++;
      onProgress?.(`Downloading library ${downloadedLibs}/${totalLibs}: ${lib.name.split(':').pop()}`, Math.round((downloadedLibs / totalLibs) * 80));
      await downloadFile(artifact.url, libPath);
    }
  }

  // 4. Download assets (only missing ones)
  try {
    const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
    const assetObjects = assetIndex.objects || {};
    const assetKeys = Object.keys(assetObjects);
    let downloadedAssets = 0;
    const totalAssets = assetKeys.length;

    for (const key of assetKeys) {
      const obj = assetObjects[key];
      const hash = obj.hash;
      const subDir = hash.substring(0, 2);
      const assetPath = path.join(assetsDir, 'objects', subDir, hash);

      if (!fs.existsSync(assetPath)) {
        downloadedAssets++;
        if (downloadedAssets % 10 === 0) {
          onProgress?.(`Downloading assets ${downloadedAssets}/${totalAssets}`, 80 + Math.round((downloadedAssets / totalAssets) * 20));
        }
        const assetUrl = `https://resources.download.minecraft.net/${subDir}/${hash}`;
        await downloadFile(assetUrl, assetPath);
      }
    }
    onProgress?.('All assets downloaded!', 100);
  } catch (err) {
    onProgress?.('Warning: Some assets may not have downloaded');
  }

  const javaVersion = detail.javaVersion?.majorVersion || 17;

  // Write version JSON for launcher
  fs.mkdirSync(clientDir, { recursive: true });
  fs.writeFileSync(path.join(clientDir, `${versionId}.json`), JSON.stringify(detail, null, 2));

  return { clientDir, mainClass: detail.mainClass, javaVersion };
}

// ---- Build classpath ----
function buildClasspath(versionId: string, detail: MCVersionDetail): string[] {
  const librariesDir = path.join(MC_DATA_DIR, 'libraries');
  const clientDir = path.join(MC_DATA_DIR, 'versions', versionId);
  const classpath: string[] = [];

  // Client jar
  classpath.push(path.join(clientDir, `${versionId}.jar`));

  // Libraries
  const platform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'osx' : 'linux';
  for (const lib of detail.libraries) {
    if (lib.rules && lib.rules.length > 0) {
      const allowed = lib.rules.some(r => {
        if (r.action === 'disallow') {
          if (r.os?.name && r.os.name !== platform) return true;
          return false;
        }
        if (r.os?.name && r.os.name !== platform) return false;
        return true;
      });
      if (!allowed) continue;
    }
    if (!lib.downloads?.artifact) continue;
    classpath.push(path.join(librariesDir, lib.downloads.artifact.path));
  }

  return classpath;
}

// ---- Build JVM arguments ----
function buildArgs(
  detail: MCVersionDetail,
  versionId: string,
  username: string,
  uuid: string,
  accessToken: string,
  customJvmArgs: string[],
): { jvmArgs: string[]; gameArgs: string[] } {
  const clientDir = path.join(MC_DATA_DIR, 'versions', versionId);
  const assetsDir = path.join(MC_DATA_DIR, 'assets');
  const nativesDir = path.join(clientDir, 'natives');
  const classpath = buildClasspath(versionId, detail);
  const platform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'osx' : 'linux';

  const jvmArgs: string[] = [
    ...customJvmArgs,
    `-Djava.library.path=${nativesDir}`,
    `-Dminecraft.launcher.brand=MCServerLauncher`,
    `-Dminecraft.launcher.version=1.0`,
    `-cp`,
    classpath.join(os.platform() === 'win32' ? ';' : ':'),
  ];

  const gameArgs: string[] = [];

  // Modern versions use the arguments object
  if (detail.arguments) {
    // JVM args
    if (detail.arguments.jvm) {
      for (const arg of detail.arguments.jvm) {
        if (typeof arg === 'string') {
          let a = arg
            .replace('${version_name}', versionId)
            .replace('${natives_directory}', nativesDir)
            .replace('${launcher_name}', 'MCServerLauncher')
            .replace('${launcher_version}', '1.0')
            .replace('${classpath}', classpath.join(os.platform() === 'win32' ? ';' : ':'));
          if (a.includes('${arch}')) a = a.replace('${arch}', os.arch() === 'x64' ? '64' : '32');
          if (!jvmArgs.includes(a)) jvmArgs.push(a);
        }
      }
    }

    // Game args
    if (detail.arguments.game) {
      for (const arg of detail.arguments.game) {
        if (typeof arg === 'string') {
          gameArgs.push(arg
            .replace('${auth_player_name}', username)
            .replace('${auth_uuid}', uuid)
            .replace('${auth_access_token}', accessToken)
            .replace('${user_type}', 'msa')
            .replace('${version_name}', versionId)
            .replace('${assets_directory}', assetsDir)
            .replace('${asset_index}', detail.assetIndex.id)
            .replace('${user_properties}', '{}'));
        }
      }
    }
  } else if (detail.minecraftArguments) {
    // Legacy versions
    const parts = detail.minecraftArguments.split(' ');
    for (let i = 0; i < parts.length; i++) {
      gameArgs.push(parts[i]
        .replace('${auth_player_name}', username)
        .replace('${auth_uuid}', uuid)
        .replace('${auth_access_token}', accessToken)
        .replace('${version_name}', versionId)
        .replace('${assets_directory}', assetsDir)
        .replace('${asset_index}', detail.assetIndex.id));
    }
  }

  // Always add these
  if (!gameArgs.includes('--username')) gameArgs.push('--username', username);
  if (!gameArgs.includes('--version')) gameArgs.push('--version', versionId);
  if (!gameArgs.includes('--gameDir')) gameArgs.push('--gameDir', path.join(MC_DATA_DIR, 'game'));
  if (!gameArgs.includes('--assetsDir')) gameArgs.push('--assetsDir', assetsDir);
  if (!gameArgs.includes('--assetIndex')) gameArgs.push('--assetIndex', detail.assetIndex.id);
  if (!gameArgs.includes('--uuid')) gameArgs.push('--uuid', uuid);
  if (!gameArgs.includes('--accessToken')) gameArgs.push('--accessToken', accessToken);
  if (!gameArgs.includes('--userType')) gameArgs.push('--userType', 'msa');

  return { jvmArgs, gameArgs };
}

// ---- Find Java ----
interface JavaInstall { path: string; majorVersion: number }

function parseMajorVersion(dirName: string): number {
  // jdk-21.0.12.101-hotspot -> 21, jdk-17 -> 17, jre-8u301 -> 8
  const m = dirName.match(/(?:jdk|jre)-?(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function getAllJavaInstalls(): JavaInstall[] {
  const installs: JavaInstall[] = [];
  const seen = new Set<string>();
  const add = (p: string, v: number) => {
    const key = p.toLowerCase();
    if (!seen.has(key) && fs.existsSync(p)) { seen.add(key); installs.push({ path: p, majorVersion: v }); }
  };

  // 1. Our own managed JREs (downloaded from Adoptium)
  try {
    const jresDir = path.join(MC_DATA_DIR, 'jres');
    if (fs.existsSync(jresDir)) {
      for (const dir of fs.readdirSync(jresDir)) {
        const major = parseMajorVersion(dir);
        const jp = path.join(jresDir, dir, 'jdk-', 'bin', 'java.exe');
        // Adoptium zips extract to a single root dir; find bin/java.exe recursively-ish
        const root = path.join(jresDir, dir);
        let found = false;
        try {
          for (const sub of fs.readdirSync(root)) {
            const jp2 = path.join(root, sub, 'bin', 'java.exe');
            if (fs.existsSync(jp2)) { add(jp2, major); found = true; break; }
          }
        } catch {}
        if (!found) {
          const jp3 = path.join(root, 'bin', 'java.exe');
          add(jp3, major);
        }
      }
    }
  } catch {}

  // 2. Registry
  try {
    const regKeys = ['HKLM\\SOFTWARE\\JavaSoft\\JDK', 'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK', 'HKLM\\SOFTWARE\\JavaSoft\\Java Runtime Environment'];
    for (const key of regKeys) {
      try {
        const { spawnSync } = require('child_process');
        const r = spawnSync('C:\\Windows\\System32\\reg.exe', ['query', key, '/s'], { encoding: 'utf-8', timeout: 5000 });
        const output = (r.stdout || '') + (r.stderr || '');
        const homeMatches = output.match(/JavaHome\s+REG_SZ\s+(.+)/gi) || [];
        for (const m of homeMatches) {
          const dir = m.split('REG_SZ')[1]?.trim();
          if (dir) {
            const jp = path.join(dir, 'bin', 'java.exe');
            const verMatch = dir.match(/(\d+)/);
            add(jp, verMatch ? parseInt(verMatch[1], 10) : 0);
          }
        }
      } catch {}
    }
  } catch {}

  // 3. Directory scan
  const driveRoots = ['C:', 'D:'];
  const programDirs = ['Program Files', 'Program Files (x86)'];
  const vendorDirs = ['Eclipse Adoptium', 'Eclipse Temurin', 'Java', 'Microsoft', 'Azul', 'BellSoft', 'Amazon Corretto', 'Zulu'];
  for (const drive of driveRoots) {
    for (const prog of programDirs) {
      for (const vendor of vendorDirs) {
        const vendorPath = drive + path.sep + prog + path.sep + vendor;
        try {
          if (!fs.existsSync(vendorPath)) continue;
          for (const v of fs.readdirSync(vendorPath)) {
            if (!v.startsWith('jdk-') && !v.startsWith('jre-')) continue;
            const jp = path.join(vendorPath, v, 'bin', 'java.exe');
            add(jp, parseMajorVersion(v));
          }
        } catch {}
      }
    }
  }

  // 4. JAVA_HOME / where
  const jh = process.env.JAVA_HOME;
  if (jh) add(path.join(jh, 'bin', 'java.exe'), parseMajorVersion(path.basename(jh)));
  try {
    const { spawnSync } = require('child_process');
    const wr = spawnSync('C:\\Windows\\System32\\where.exe', ['java'], { encoding: 'utf-8', timeout: 5000 });
    const where = (wr.stdout || '').trim();
    if (where) add(where.split('\n')[0].trim(), 0);
  } catch {}

  return installs;
}

function findJavaForVersion(requiredVersion: number): string | null {
  const installs = getAllJavaInstalls();
  // ONLY accept installs that meet the requirement — never fall back to older Java
  // (older JVMs crash on new MC's JVM flags). Caller downloads the right JRE if null.
  const eligible = installs.filter(i => i.majorVersion >= requiredVersion);
  eligible.sort((a, b) => a.majorVersion - b.majorVersion); // closest match first
  return eligible[0]?.path || null;
}

// ---- Auto-download required JRE from Adoptium ----
async function downloadJRE(majorVersion: number, onProgress?: ProgressCallback): Promise<string> {
  const jreDir = path.join(MC_DATA_DIR, 'jres', `java-${majorVersion}`);
  const markerFile = path.join(jreDir, '.installed');

  // Already downloaded?
  if (fs.existsSync(markerFile)) {
    const cached = fs.readFileSync(markerFile, 'utf-8').trim();
    if (fs.existsSync(cached)) return cached;
  }

  onProgress?.(`Downloading Java ${majorVersion} runtime (required for this MC version)...`);

  const url = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk`;
  const zipPath = path.join(jreDir, 'jre.zip');
  fs.mkdirSync(jreDir, { recursive: true });
  await downloadFile(url, zipPath, onProgress);

  onProgress?.('Extracting Java runtime...');
  const { spawnSync } = require('child_process');
  // Primary: Windows built-in tar (fast, reliable). Fallback: PowerShell Expand-Archive
  let tarResult = spawnSync('C:\\Windows\\System32\\tar.exe', ['-xf', zipPath, '-C', jreDir], { timeout: 300000, stdio: 'ignore' });
  if (tarResult.status !== 0) {
    tarResult = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${jreDir}' -Force`],
      { timeout: 300000, stdio: 'ignore' });
  }
  if (tarResult.status !== 0) throw new Error(`Failed to extract Java runtime (exit ${tarResult.status})`);
  fs.unlinkSync(zipPath);

  // Find java.exe in extracted dir
  let javaExe: string | null = null;
  const findJavaExe = (dir: string, depth: number): string | null => {
    if (depth > 4) return null;
    try {
      const jp = path.join(dir, 'bin', 'java.exe');
      if (fs.existsSync(jp)) return jp;
      for (const sub of fs.readdirSync(dir)) {
        const full = path.join(dir, sub);
        if (fs.statSync(full).isDirectory()) {
          const r = findJavaExe(full, depth + 1);
          if (r) return r;
        }
      }
    } catch {}
    return null;
  };
  javaExe = findJavaExe(jreDir, 0);

  if (!javaExe) throw new Error(`Failed to extract Java ${majorVersion} runtime`);

  fs.writeFileSync(markerFile, javaExe);
  return javaExe;
}

// ---- Launch game ----
let gameProcess: any = null;

export async function launchGame(
  versionId: string,
  username: string,
  javaPath: string,
  ramMin: string,
  ramMax: string,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  if (gameProcess) {
    throw new Error('Game already running');
  }

  const sendProgress = (msg: string, pct?: number) => {
    mainWindow?.webContents.send('mc:progress', msg, pct);
  };

  sendProgress('Preparing to launch...');

  const detail = await getVersionDetail(versionId);
  const requiredJava = detail.javaVersion?.majorVersion || 17;

  // Find the right Java version — auto-download if missing
  let java = javaPath;
  if (!java) {
    java = findJavaForVersion(requiredJava);
    if (!java) {
      sendProgress(`No Java ${requiredJava}+ found — downloading runtime...`);
      java = await downloadJRE(requiredJava, sendProgress);
    }
  }

  // Generate offline UUID from username
  const { createHash } = await import('crypto');
  const uuid = createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
  const formattedUuid = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;

  const { jvmArgs, gameArgs } = buildArgs(detail, versionId, username, formattedUuid, 'offline', [
    `-Xms${ramMin}`,
    `-Xmx${ramMax}`,
  ]);

  sendProgress('Launching Minecraft...', 100);

  const gameDir = path.join(MC_DATA_DIR, 'game');
  fs.mkdirSync(gameDir, { recursive: true });

  const child = spawn(java, [...jvmArgs, detail.mainClass, ...gameArgs], {
    cwd: gameDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PATH: path.dirname(java) + ';' + (process.env.PATH || '') },
  });

  gameProcess = child;

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    if (text.includes('Starting') || text.includes('Setting user') || text.includes('LWJGL')) {
      sendProgress(text.trim());
    }
    mainWindow?.webContents.send('mc:console', text);
  });

  child.stderr?.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('mc:console', data.toString());
  });

  child.on('close', (code: number) => {
    gameProcess = null;
    mainWindow?.webContents.send('mc:exit', code);
  });

  child.on('error', (err: Error) => {
    gameProcess = null;
    throw err;
  });
}

// ---- Server-side Java helpers ----
export function requiredJavaForMcVersion(version: string): number {
  const m = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 17;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = m[3] ? parseInt(m[3], 10) : 0;
  if (a !== 1) return 25;              // 26.x style future versions
  if (b > 20 || (b === 20 && c >= 5)) return 21; // 1.20.5+ → Java 21
  if (b >= 18) return 17;              // 1.18+ → Java 17
  if (b >= 17) return 16;              // 1.17 → Java 16+
  return 8;
}

export function findBestJava(required: number): string | null {
  return findJavaForVersion(required);
}

export async function ensureJavaRuntime(required: number, onProgress?: ProgressCallback): Promise<string> {
  const found = findJavaForVersion(required);
  if (found) return found;
  return downloadJRE(required, onProgress);
}

export function isGameRunning(): boolean {
  return gameProcess !== null && !gameProcess.killed;
}

export function killGame(): void {
  if (gameProcess && !gameProcess.killed) {
    gameProcess.kill();
    gameProcess = null;
  }
}

export function getGameDataDir(): string {
  return MC_DATA_DIR;
}
