import { contextBridge, ipcRenderer } from 'electron';

function removeListener(channel: string, handler: (...args: any[]) => void) {
  ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Java
  findJava: () => ipcRenderer.invoke('java:find'),
  installJava: () => ipcRenderer.invoke('java:install'),

  // Servers
  listServers: () => ipcRenderer.invoke('servers:list'),
  getServer: (id: string) => ipcRenderer.invoke('servers:get', id),
  createServer: (config: any) => ipcRenderer.invoke('servers:create', config),
  deleteServer: (id: string) => ipcRenderer.invoke('servers:delete', id),
  startServer: (id: string) => ipcRenderer.invoke('servers:start', id),
  stopServer: (id: string) => ipcRenderer.invoke('servers:stop', id),
  sendCommand: (id: string, cmd: string) => ipcRenderer.invoke('servers:command', id, cmd),
  getConsole: (id: string) => ipcRenderer.invoke('servers:console:get', id),
  getServerStatus: (id: string) => ipcRenderer.invoke('servers:status', id),
  getServerInfo: (id: string) => ipcRenderer.invoke('servers:get-info', id),
  saveServerConfig: (id: string, config: any) => ipcRenderer.invoke('servers:config:save', id, config),
  getLogs: (id: string) => ipcRenderer.invoke('servers:logs', id),
  backupServer: (id: string) => ipcRenderer.invoke('servers:backup', id),
  restoreServer: () => ipcRenderer.invoke('servers:restore'),

  // Mods
  listMods: (id: string) => ipcRenderer.invoke('mods:list', id),
  uploadMods: (id: string) => ipcRenderer.invoke('mods:upload', id),
  deleteMod: (id: string, name: string) => ipcRenderer.invoke('mods:delete', id, name),

  // Players
  listPlayers: (id: string) => ipcRenderer.invoke('players:list', id),
  banPlayer: (id: string, uuid: string) => ipcRenderer.invoke('players:ban', id, uuid),
  pardonPlayer: (id: string, uuid: string) => ipcRenderer.invoke('players:pardon', id, uuid),
  kickPlayer: (id: string, name: string) => ipcRenderer.invoke('players:kick', id, name),

  // Defaults
  getDefaults: () => ipcRenderer.invoke('defaults:list'),
  getDeployedDefaults: (id: string) => ipcRenderer.invoke('defaults:get-deployed', id),
  deployDefaults: (id: string) => ipcRenderer.invoke('defaults:deploy', id),
  deployDefaultsAll: () => ipcRenderer.invoke('defaults:deploy-all'),
  uploadDefault: (type: string) => ipcRenderer.invoke('defaults:upload', type),
  removeDefault: (type: string, file: string) => ipcRenderer.invoke('defaults:remove', type, file),

  // System
  openFolder: (id: string) => ipcRenderer.invoke('system:openFolder', id),
  checkPort: (port: number) => ipcRenderer.invoke('system:check-port', port),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  fetchVersions: () => ipcRenderer.invoke('versions:fetch'),

  // Minecraft Client
  mcVersions: () => ipcRenderer.invoke('mc:versions'),
  mcSafeRam: () => ipcRenderer.invoke('mc:safe-ram'),
  mcDownload: (versionId: string) => ipcRenderer.invoke('mc:download', versionId),
  mcLaunch: (versionId: string, username: string, javaPath: string, ramMin: string, ramMax: string) => ipcRenderer.invoke('mc:launch', versionId, username, javaPath, ramMin, ramMax),
  mcStatus: () => ipcRenderer.invoke('mc:status'),
  mcKill: () => ipcRenderer.invoke('mc:kill'),
  mcGameDir: () => ipcRenderer.invoke('mc:game-dir'),

  // Cloud Storage
  cloudStatus: () => ipcRenderer.invoke('cloud:status'),
  cloudConfigure: (creds: any) => ipcRenderer.invoke('cloud:configure', creds),
  cloudList: (dir: string) => ipcRenderer.invoke('cloud:list', dir),
  cloudUpload: (localPath: string, remotePath: string) => ipcRenderer.invoke('cloud:upload', localPath, remotePath),
  cloudDownload: (fsId: number, localPath: string) => ipcRenderer.invoke('cloud:download', fsId, localPath),
  cloudUploadBackup: (serverId: string) => ipcRenderer.invoke('cloud:upload-backup', serverId),
  cloudUploadDir: (serverId: string) => ipcRenderer.invoke('cloud:upload-dir', serverId),
  cloudDelete: (remotePath: string) => ipcRenderer.invoke('cloud:delete', remotePath),
  onCloudProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('cloud:progress', handler);
    return () => ipcRenderer.removeListener('cloud:progress', handler);
  },

  // Cloud Sync
  cloudServers: () => ipcRenderer.invoke('cloud:servers'),
  cloudPull: (serverId: string) => ipcRenderer.invoke('cloud:pull', serverId),
  cloudPush: (serverId: string) => ipcRenderer.invoke('cloud:push', serverId),

  // 24/7 Bot
  botStart: (serverId: string) => ipcRenderer.invoke('bot:start', serverId),
  botStop: () => ipcRenderer.invoke('bot:stop'),
  botStatus: () => ipcRenderer.invoke('bot:status'),
  onBotStatus: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('bot:status', handler);
    return () => ipcRenderer.removeListener('bot:status', handler);
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Events
  onConsole: (callback: (id: string, line: any) => void) => {
    const handler = (_: any, id: string, line: any) => callback(id, line);
    ipcRenderer.on('server:console', handler);
    return () => removeListener('server:console', handler);
  },
  onStatus: (callback: (id: string, status: any) => void) => {
    const handler = (_: any, id: string, status: any) => callback(id, status);
    ipcRenderer.on('server:status', handler);
    return () => removeListener('server:status', handler);
  },
  onDownloadProgress: (callback: (message: string, percent?: number) => void) => {
    const handler = (_: any, message: string, percent?: number) => callback(message, percent);
    ipcRenderer.on('server:download-progress', handler);
    return () => removeListener('server:download-progress', handler);
  },
  onMcProgress: (callback: (message: string, percent?: number) => void) => {
    const handler = (_: any, message: string, percent?: number) => callback(message, percent);
    ipcRenderer.on('mc:progress', handler);
    return () => removeListener('mc:progress', handler);
  },
  onMcConsole: (callback: (text: string) => void) => {
    const handler = (_: any, text: string) => callback(text);
    ipcRenderer.on('mc:console', handler);
    return () => removeListener('mc:console', handler);
  },
  onMcExit: (callback: (code: number) => void) => {
    const handler = (_: any, code: number) => callback(code);
    ipcRenderer.on('mc:exit', handler);
    return () => removeListener('mc:exit', handler);
  },
});
