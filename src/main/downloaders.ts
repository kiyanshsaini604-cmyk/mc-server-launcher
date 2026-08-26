import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';

type ProgressCallback = (message: string, percent?: number) => void;

const USER_AGENT = 'MCServerLauncher/1.0.0 (https://github.com/kiyanshsaini604-cmyk/Ultron)';

async function fetchJSON(url: string): Promise<any> {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function downloadFile(url: string, destPath: string, onProgress?: ProgressCallback): Promise<void> {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);

  const totalBytes = Number(res.headers.get('content-length') || 0);
  const writer = fs.createWriteStream(destPath);
  let downloaded = 0;

  return new Promise((resolve, reject) => {
    res.body?.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      writer.write(chunk);
      if (onProgress && totalBytes > 0) {
        const pct = Math.round((downloaded / totalBytes) * 100);
        onProgress(`Downloading... ${formatSize(downloaded)} / ${formatSize(totalBytes)}`, pct);
      }
    });
    res.body?.on('end', () => {
      writer.end();
      resolve();
    });
    res.body?.on('error', (err: Error) => {
      writer.destroy();
      reject(err);
    });
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Vanilla ----
export async function downloadVanilla(
  version: string,
  destPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Fetching Minecraft version manifest...');
  const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const versionData = manifest.versions.find((v: any) => v.id === version);
  if (!versionData) throw new Error(`Minecraft version ${version} not found`);

  onProgress?.(`Fetching version info for ${version}...`);
  const versionInfo = await fetchJSON(versionData.url);
  const serverUrl = versionInfo.downloads?.server?.url;
  if (!serverUrl) throw new Error(`Server JAR not available for ${version}`);

  onProgress?.('Downloading vanilla server JAR...', 0);
  await downloadFile(serverUrl, destPath, onProgress);
  onProgress?.('Vanilla server JAR downloaded!', 100);
}

// ---- Paper ----
export async function downloadPaper(
  version: string,
  destPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Querying Paper API for latest build...');
  // Try v2 API first (more widely available)
  let buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
  let buildsData: any;
  try {
    buildsData = await fetchJSON(buildsUrl);
  } catch {
    // Fallback: try v3 API
    onProgress?.('Trying Paper v3 API...');
    buildsUrl = `https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`;
    buildsData = await fetchJSON(buildsUrl);
  }

  // Find the latest stable build
  const builds = buildsData.builds || buildsData;
  const stableBuilds = Array.isArray(builds)
    ? builds.filter((b: any) => b.channel === 'STABLE' || !b.channel)
    : [];

  if (stableBuilds.length === 0) {
    throw new Error(`No stable Paper build found for Minecraft ${version}`);
  }

  const latestBuild = stableBuilds[stableBuilds.length - 1];
  const buildNumber = latestBuild.build;
  const downloadName = latestBuild.downloads?.['server:default']?.name
    || `paper-${version}-${buildNumber}.jar`;

  // v2 download URL
  const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${buildNumber}/downloads/${downloadName}`;

  onProgress?.(`Downloading Paper ${version} build #${buildNumber}...`, 0);
  await downloadFile(downloadUrl, destPath, onProgress);
  onProgress?.(`Paper ${version} build #${buildNumber} downloaded!`, 100);
}

// ---- Purpur ----
export async function downloadPurpur(
  version: string,
  destPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Querying Purpur API...');

  // Get available versions to verify this MC version is supported
  const versionsData = await fetchJSON('https://api.purpurmc.org/v2/purpur');
  const availableVersions = versionsData.versions || [];
  if (!availableVersions.includes(version)) {
    throw new Error(
      `Purpur does not support Minecraft ${version}. Available: ${availableVersions.slice(0, 10).join(', ')}...`
    );
  }

  // Download latest build for this version
  const downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
  onProgress?.(`Downloading Purpur for ${version}...`, 0);
  await downloadFile(downloadUrl, destPath, onProgress);
  onProgress?.(`Purpur for ${version} downloaded!`, 100);
}

// ---- Forge ----
export async function downloadForge(
  version: string,
  destPath: string,
  javaPath: string,
  serverDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Fetching Forge promotions...');

  const promotionsUrl = 'https://maven.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
  const promotions = await fetchJSON(promotionsUrl);

  // Find the latest version for this MC version
  const mcForgeVersions: string[] = [];
  for (const [key, value] of Object.entries(promotions.promos || {})) {
    if (key.startsWith(`${version}-`) && (value as string) === 'latest') {
      mcForgeVersions.push(key);
    }
  }

  // Also check all promos for this MC version
  for (const key of Object.keys(promotions.promos || {})) {
    if (key.startsWith(`${version}-`) && !mcForgeVersions.includes(key)) {
      mcForgeVersions.push(key);
    }
  }

  if (mcForgeVersions.length === 0) {
    throw new Error(`No Forge version found for Minecraft ${version}. Check https://files.minecraftforge.net for supported versions.`);
  }

  // Use the first match (latest or recommended)
  const forgeVersion = mcForgeVersions[0];
  onProgress?.(`Found Forge ${forgeVersion}, downloading installer...`);

  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
  const installerPath = path.join(serverDir, 'forge-installer.jar');
  await downloadFile(installerUrl, installerPath, onProgress);

  // Run the installer
  onProgress?.('Running Forge installer (this may take a minute)...', 50);
  await runForgeInstaller(javaPath, installerPath, serverDir, onProgress);

  // The installer creates a forge server jar - rename it to server.jar
  // Find the forge jar (not the installer)
  const files = fs.readdirSync(serverDir);
  const forgeJar = files.find(f =>
    f.startsWith('forge-') && f.endsWith('.jar') && !f.includes('installer')
  );

  if (forgeJar) {
    fs.copyFileSync(path.join(serverDir, forgeJar), destPath);
    // Clean up installer and original forge jar
    fs.unlinkSync(installerPath);
    fs.unlinkSync(path.join(serverDir, forgeJar));
  }

  onProgress?.(`Forge ${forgeVersion} installed!`, 100);
}

async function runForgeInstaller(
  javaPath: string,
  installerPath: string,
  serverDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installServer'], {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Extract progress from Forge installer output
      const progressMatch = text.match(/(\d+)%/);
      if (progressMatch && onProgress) {
        const pct = Math.min(50 + Math.round(parseInt(progressMatch[1]) * 0.5), 99);
        onProgress(`Forge installer: ${progressMatch[1]}%`, pct);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Forge installer failed (exit code ${code}):\n${stderr || stdout}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to run Forge installer: ${err.message}`));
    });
  });
}

// ---- Fabric ----
export async function downloadFabric(
  version: string,
  destPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Querying Fabric Meta API...');

  // Get the latest stable loader for this MC version
  const loaders = await fetchJSON(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`
  );

  if (!loaders || loaders.length === 0) {
    throw new Error(`No Fabric loader found for Minecraft ${version}. Fabric may not support this version.`);
  }

  // Pick the latest stable loader
  const stableLoader = loaders.find((l: any) => l.loader?.stable) || loaders[0];
  const loaderVersion = stableLoader.loader.version;

  // Fabric provides a server JAR directly
  const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loaderVersion)}/1.0.1/server/jar`;

  onProgress?.(`Downloading Fabric loader ${loaderVersion} for ${version}...`, 0);
  await downloadFile(downloadUrl, destPath, onProgress);
  onProgress?.(`Fabric ${loaderVersion} for ${version} downloaded!`, 100);
}

// ---- Spigot (via BuildTools) ----
export async function downloadSpigot(
  version: string,
  destPath: string,
  javaPath: string,
  serverDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.('Spigot requires BuildTools to compile. This may take several minutes...');

  const buildToolsDir = path.join(serverDir, '.buildtools');
  fs.mkdirSync(buildToolsDir, { recursive: true });

  // Download BuildTools
  const buildToolsUrl = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
  const buildToolsPath = path.join(buildToolsDir, 'BuildTools.jar');

  onProgress?.('Downloading BuildTools...', 0);
  await downloadFile(buildToolsUrl, buildToolsPath, onProgress);

  onProgress?.('Running BuildTools (this may take 5-15 minutes)...', 10);

  // Run BuildTools
  await runBuildTools(javaPath, buildToolsPath, buildToolsDir, version, onProgress);

  // Copy the compiled spigot jar to destPath
  const spigotJar = path.join(buildToolsDir, `Spigot-${version}.jar`);
  const craftBukkitJar = path.join(buildToolsDir, `craftbukkit-${version}.jar`);

  if (fs.existsSync(spigotJar)) {
    fs.copyFileSync(spigotJar, destPath);
  } else if (fs.existsSync(craftBukkitJar)) {
    fs.copyFileSync(craftBukkitJar, destPath);
  } else {
    // Look for any jar that might be the output
    const jars = fs.readdirSync(buildToolsDir).filter(f => f.endsWith('.jar') && !f.includes('BuildTools'));
    if (jars.length > 0) {
      fs.copyFileSync(path.join(buildToolsDir, jars[0]), destPath);
    } else {
      throw new Error('BuildTools completed but no Spigot JAR was produced. Check the build log.');
    }
  }

  onProgress?.(`Spigot ${version} compiled and ready!`, 100);
}

async function runBuildTools(
  javaPath: string,
  buildToolsPath: string,
  workDir: string,
  mcVersion: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', buildToolsPath, '--rev', mcVersion], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      // Report progress from BuildTools output
      if (text.includes('Compiling')) {
        onProgress?.('BuildTools: Compiling...', 50);
      } else if (text.includes('SUCCESS') || text.includes('Finished')) {
        onProgress?.('BuildTools: Done!', 90);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`BuildTools failed (exit code ${code}):\n${stderr.slice(-500)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to run BuildTools: ${err.message}\nMake sure Java and Git are installed.`));
    });
  });
}

// ---- Modrinth Resource Pack / Shader / Mod Download ----

export interface ModrinthPack {
  modrinthId: string;
  slug: string;
  label: string;
  description: string;
  downloads: number;
  icon?: string | null;
  modLoader?: string[];
}

export interface ModrinthVersionFile {
  hashes: Record<string, string>;
  url: string;
  filename: string;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders?: string[];
  files: ModrinthVersionFile[];
  status: string;
}

const MODRINTH_API = 'https://api.modrinth.com/v2';
const MODRINTH_AGENT = 'MCServerLauncher/1.0.0 (https://github.com/kiyanshsaini604-cmyk/Ultron)';

async function modrinthFetch(url: string): Promise<any> {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, { headers: { 'User-Agent': MODRINTH_AGENT } });
  if (!res.ok) throw new Error(`Modrinth API error: HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Find the best matching version of a Modrinth project for a given MC version.
 * Tries exact match first, then falls back to the closest lower version.
 */
async function findBestModrinthVersion(
  projectId: string,
  mcVersion: string,
  projectType: 'resourcepack' | 'shader' | 'mod',
  modLoader?: string,
): Promise<ModrinthVersion | null> {
  // Get all versions for this project
  const url = `${MODRINTH_API}/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}${modLoader ? `&loaders=${encodeURIComponent(JSON.stringify([modLoader]))}` : ''}`;
  const versions: ModrinthVersion[] = await modrinthFetch(url);

  if (versions.length > 0) {
    // Return the latest version that matches exactly
    return versions[0];
  }

  // Fallback: get ALL versions and find the closest one
  const allVersions: ModrinthVersion[] = await modrinthFetch(
    `${MODRINTH_API}/project/${projectId}/version`
  );

  if (allVersions.length === 0) return null;

  // Parse MC version for comparison
  const parseVer = (v: string) => {
    const parts = v.split('.').map(Number);
    return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  };

  const targetNum = parseVer(mcVersion);

  // Find versions that support this MC version OR the closest lower one
  let bestMatch: ModrinthVersion | null = null;
  let bestScore = -Infinity;

  for (const ver of allVersions) {
    if (ver.status === 'archived' || ver.status === 'withdrawn') continue;

    const gameVersions = ver.game_versions || [];
    // Check if this version directly supports our MC version
    if (gameVersions.includes(mcVersion)) {
      return ver; // Exact match
    }

    // Find the closest supported version that's <= target
    for (const gv of gameVersions) {
      const gvNum = parseVer(gv);
      if (gvNum <= targetNum && gvNum > bestScore) {
        bestScore = gvNum;
        bestMatch = ver;
      }
    }
  }

  return bestMatch || allVersions[0]; // Last resort: return latest version
}

/**
 * Download a resource pack, shader, or mod from Modrinth for a specific MC version.
 * Returns the filename of the downloaded file.
 */
export async function downloadFromModrinth(
  projectId: string,
  mcVersion: string,
  destDir: string,
  projectType: 'resourcepack' | 'shader' | 'mod',
  modLoader?: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  onProgress?.(`Finding best ${projectType} version for MC ${mcVersion}...`);

  const version = await findBestModrinthVersion(projectId, mcVersion, projectType, modLoader);
  if (!version) {
    throw new Error(`No compatible version found for project ${projectId} and MC ${mcVersion}`);
  }

  // Pick the first file (usually the main download)
  const file = version.files[0];
  if (!file || !file.url) {
    throw new Error(`No downloadable file found for ${version.name}`);
  }

  onProgress?.(`Downloading ${file.filename} (${formatSize(file.size)})...`, 0);

  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, file.filename);

  // Skip if already downloaded
  if (fs.existsSync(destPath)) {
    onProgress?.(`${file.filename} already exists, skipping`, 100);
    return file.filename;
  }

  await downloadFile(file.url, destPath, onProgress);
  onProgress?.(`Downloaded ${file.filename}!`, 100);

  return file.filename;
}

// ---- Main dispatcher ----
export async function downloadServerJar(
  modLoader: string,
  version: string,
  destPath: string,
  serverDir: string,
  javaPath: string,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const sendProgress = (msg: string, pct?: number) => {
    mainWindow?.webContents.send('server:download-progress', msg, pct);
  };

  sendProgress(`Starting download (${modLoader})...`);

  switch (modLoader) {
    case 'vanilla':
      await downloadVanilla(version, destPath, sendProgress);
      break;
    case 'paper':
      await downloadPaper(version, destPath, sendProgress);
      break;
    case 'purpur':
      await downloadPurpur(version, destPath, sendProgress);
      break;
    case 'forge':
      await downloadForge(version, destPath, javaPath, serverDir, sendProgress);
      break;
    case 'fabric':
      await downloadFabric(version, destPath, sendProgress);
      break;
    case 'spigot':
      await downloadSpigot(version, destPath, javaPath, serverDir, sendProgress);
      break;
    default:
      throw new Error(`Unknown mod loader: ${modLoader}`);
  }

  sendProgress('Download complete!', 100);
}
