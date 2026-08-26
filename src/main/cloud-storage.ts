import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// TeraBox credentials config
const CONFIG_DIR = path.join(os.homedir(), '.mc-launcher-data');
const CRED_FILE = path.join(CONFIG_DIR, 'cloud-credentials.json');

export interface CloudCredentials {
  ndus: string;
  jsToken: string;
  appId: string;
  bdstoken?: string;
  browserId?: string;
}

export interface CloudFile {
  fs_id: number;
  path: string;
  server_filename: string;
  size: number;
  isdir: number;
  server_mtime: number;
}

function loadCredentials(): CloudCredentials | null {
  try {
    if (!fs.existsSync(CRED_FILE)) return null;
    return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  } catch { return null; }
}

function saveCredentials(creds: CloudCredentials): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
}

let uploader: any = null;

async function getUploader(): Promise<any> {
  const creds = loadCredentials();
  if (!creds) throw new Error('Cloud storage not configured. Go to Settings → Cloud Storage to set up TeraBox.');

  if (!uploader) {
    // Dynamic import because terabox-upload-tool is CommonJS
    const TeraboxUploader = (await import('terabox-upload-tool' as any)).default;
    uploader = new TeraboxUploader({
      ndus: creds.ndus,
      jsToken: creds.jsToken,
      appId: creds.appId || '250528',
      bdstoken: creds.bdstoken || '',
      browserId: creds.browserId || '',
    });
  }
  return uploader;
}

// ---- Public API ----

export function isCloudConfigured(): boolean {
  return loadCredentials() !== null;
}

export function configureCloud(creds: CloudCredentials): { success: boolean } {
  saveCredentials(creds);
  uploader = null; // Reset so next call uses new creds
  return { success: true };
}

export function getCloudStatus(): { configured: boolean; ndus?: string } {
  const creds = loadCredentials();
  if (!creds) return { configured: false };
  return { configured: true, ndus: creds.ndus.substring(0, 8) + '...' };
}

export async function listCloudFiles(dirPath: string = '/'): Promise<CloudFile[]> {
  const up = await getUploader();
  const result = await up.fetchFileList(dirPath);
  return result?.data?.list || [];
}

export async function uploadToCloud(
  localPath: string,
  remotePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ success: boolean; path: string }> {
  const up = await getUploader();

  // Ensure remote directory exists
  const remoteDir = path.posix.dirname(remotePath);
  if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
    try { await up.createDirectory(remoteDir); } catch {}
  }

  const result = await up.uploadFile(localPath, (loaded: number, total: number) => {
    onProgress?.(loaded, total);
  }, path.posix.dirname(remotePath));

  return { success: true, path: remotePath };
}

export async function downloadFromCloud(
  fsId: number,
  localPath: string,
): Promise<{ success: boolean; path: string }> {
  const up = await getUploader();
  const result = await up.downloadFile(fsId);

  if (!result?.downloadLink) {
    throw new Error('Failed to get download link from TeraBox');
  }

  // Download using fetch
  const res = await fetch(result.downloadLink);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading from TeraBox`);

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buffer);

  return { success: true, path: localPath };
}

export async function deleteCloudFile(remotePath: string): Promise<{ success: boolean }> {
  const up = await getUploader();
  await up.deleteFiles([remotePath]);
  return { success: true };
}

export async function createCloudDir(dirPath: string): Promise<{ success: boolean }> {
  const up = await getUploader();
  await up.createDirectory(dirPath);
  return { success: true };
}

// Upload entire directory recursively
export async function uploadDirToCloud(
  localDir: string,
  remoteDir: string,
  onProgress?: (message: string, percent?: number) => void,
): Promise<{ uploaded: number; errors: number }> {
  const up = await getUploader();
  let uploaded = 0;
  let errors = 0;

  // Ensure remote dir exists
  try { await up.createDirectory(remoteDir); } catch {}

  const files = getAllFiles(localDir);
  const total = files.length;

  for (const filePath of files) {
    const relative = path.relative(localDir, filePath).replace(/\\/g, '/');
    const remotePath = `${remoteDir}/${relative}`;
    const remoteSubDir = path.posix.dirname(remotePath);

    try {
      // Ensure subdirectory exists
      if (remoteSubDir !== remoteDir) {
        try { await up.createDirectory(remoteSubDir); } catch {}
      }
      await up.uploadFile(filePath, () => {}, path.posix.dirname(remotePath));
      uploaded++;
      onProgress?.(`Uploaded ${uploaded}/${total}: ${relative}`, Math.round((uploaded / total) * 100));
    } catch (err) {
      errors++;
      onProgress?.(`Failed: ${relative}`, Math.round((uploaded / total) * 100));
    }
  }

  return { uploaded, errors };
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllFiles(full));
      } else {
        results.push(full);
      }
    }
  } catch {}
  return results;
}
