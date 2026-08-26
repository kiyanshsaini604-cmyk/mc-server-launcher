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
});
