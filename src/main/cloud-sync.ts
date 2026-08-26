import * as fs from 'fs';
import * as path from 'path';
import { listCloudFiles, uploadToCloud, downloadFromCloud, createCloudDir, isCloudConfigured } from './cloud-storage';
import { BrowserWindow } from 'electron';

const CLOUD_SERVERS_DIR = '/MC-Servers';

type ProgressCallback = (msg: string, pct?: number) => void;

// Get list of server IDs stored on TeraBox
export async function getCloudServerIds(): Promise<string[]> {
  if (!isCloudConfigured()) return [];
  try {
    const files = await listCloudFiles(CLOUD_SERVERS_DIR);
    return files.filter((f: any) => f.isdir).map((f: any) => f.server_filename);
  } catch { return []; }
}

// Pull server files from TeraBox to local
export async function pullServerFromCloud(
  serverId: string,
  localServerDir: string,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; filesDownloaded: number }> {
  if (!isCloudConfigured()) throw new Error('Cloud storage not configured');
  
  const remoteDir = `${CLOUD_SERVERS_DIR}/${serverId}`;
  onProgress?.(`Syncing ${serverId} from cloud...`, 0);

  // List all files on cloud
  const cloudFiles = await listCloudFiles(remoteDir);
  if (!cloudFiles || cloudFiles.length === 0) {
    onProgress?.('No cloud data found for this server', 100);
    return { success: true, filesDownloaded: 0 };
  }

  let downloaded = 0;
  const total = cloudFiles.length;

  for (const file of cloudFiles) {
    if (file.isdir) continue; // Skip directories
    const relativePath = file.path.replace(remoteDir, '').replace(/^\//, '');
    const localPath = path.join(localServerDir, relativePath);

    // Skip if local file exists and is same size
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      if (stat.size === file.size) {
        downloaded++;
        continue;
      }
    }

    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    onProgress?.(`Downloading: ${relativePath}`, Math.round((downloaded / total) * 100));
    
    try {
      await downloadFromCloud(file.fs_id, localPath);
      downloaded++;
    } catch (err) {
      console.error(`Failed to download ${relativePath}:`, err);
    }
  }

  onProgress?.(`Synced ${downloaded}/${total} files`, 100);
  return { success: true, filesDownloaded: downloaded };
}

// Push local server files to TeraBox
export async function pushServerToCloud(
  serverId: string,
  localServerDir: string,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; filesUploaded: number }> {
  if (!isCloudConfigured()) throw new Error('Cloud storage not configured');

  const remoteDir = `${CLOUD_SERVERS_DIR}/${serverId}`;
  onProgress?.(`Backing up ${serverId} to cloud...`, 0);

  // Ensure remote directory exists
  try { await createCloudDir(remoteDir); } catch {}

  // List all local files
  const localFiles = getAllFiles(localServerDir);
  const total = localFiles.length;
  let uploaded = 0;

  for (const filePath of localFiles) {
    const relative = path.relative(localServerDir, filePath).replace(/\\/g, '/');
    const remotePath = `${remoteDir}/${relative}`;
    const remoteSubDir = path.posix.dirname(remotePath);

    try {
      if (remoteSubDir !== remoteDir) {
        try { await createCloudDir(remoteSubDir); } catch {}
      }
      await uploadToCloud(filePath, remotePath);
      uploaded++;
      onProgress?.(`Uploaded ${uploaded}/${total}: ${relative}`, Math.round((uploaded / total) * 100));
    } catch (err) {
      console.error(`Failed to upload ${relative}:`, err);
    }
  }

  onProgress?.(`Uploaded ${uploaded}/${total} files`, 100);
  return { success: true, filesUploaded: uploaded };
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip world/session files that don't need syncing
        if (['logs', 'crash-reports', '.git'].includes(entry.name)) continue;
        results.push(...getAllFiles(full));
      } else {
        // Skip large temp files
        if (entry.name.endsWith('.tmp') || entry.name.endsWith('.zip.tmp')) continue;
        results.push(full);
      }
    }
  } catch {}
  return results;
}
