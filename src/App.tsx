import React, { useState, useEffect, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ServerView from './components/ServerView';
import CreateServer from './components/CreateServer';
import Settings from './components/Settings';
import type { ServerConfig, AppView } from './types';

declare global {
  interface Window {
    electronAPI: {
      findJava: () => Promise<{ path: string; version: string; is64Bit: boolean } | null>;
      installJava: () => Promise<any>;
      listServers: () => Promise<ServerConfig[]>;
      getServer: (id: string) => Promise<ServerConfig>;
      createServer: (config: any) => Promise<{ success: boolean; config?: ServerConfig; error?: string }>;
      deleteServer: (id: string) => Promise<any>;
      startServer: (id: string) => Promise<any>;
      stopServer: (id: string) => Promise<any>;
      sendCommand: (id: string, cmd: string) => Promise<any>;
      getConsole: (id: string) => Promise<any[]>;
      getServerStatus: (id: string) => Promise<{ running: boolean; pid: number | null }>;
      getServerInfo: (id: string) => Promise<{ localIP: string; publicIP: string; port: number; running: boolean; onlinePlayers: string[]; maxPlayers: number; motd: string; version: string; modLoader: string }>;
      saveServerConfig: (id: string, config: any) => Promise<any>;
      getLogs: (id: string) => Promise<string>;
      listMods: (id: string) => Promise<any[]>;
      uploadMods: (id: string) => Promise<any>;
      deleteMod: (id: string, name: string) => Promise<any>;
      listPlayers: (id: string) => Promise<any>;
      banPlayer: (id: string, uuid: string) => Promise<any>;
      pardonPlayer: (id: string, uuid: string) => Promise<any>;
      kickPlayer: (id: string, name: string) => Promise<any>;
      openFolder: (id: string) => Promise<any>;
      checkPort: (port: number) => Promise<boolean>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      backupServer: (id: string) => Promise<any>;
      restoreServer: () => Promise<any>;
      getSystemInfo: () => Promise<any>;
      fetchVersions: () => Promise<any[]>;
      getDefaults: () => Promise<any>;
      getDeployedDefaults: (id: string) => Promise<string[]>;
      deployDefaults: (id: string) => Promise<any>;
      deployDefaultsAll: () => Promise<any>;
      uploadDefault: (type: string) => Promise<any>;
      removeDefault: (type: string, file: string) => Promise<any>;
      onConsole: (callback: (id: string, line: any) => void) => (() => void);
      onStatus: (callback: (id: string, status: any) => void) => (() => void);
      onDownloadProgress: (callback: (message: string, percent?: number) => void) => (() => void);
    };
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('dashboard');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [serverStatuses, setServerStatuses] = useState<Record<string, boolean>>({});

  const loadServers = useCallback(async () => {
    try {
      const list = await window.electronAPI.listServers();
      setServers(list);
      const statuses: Record<string, boolean> = {};
      for (const s of list) {
        const status = await window.electronAPI.getServerStatus(s.id);
        statuses[s.id] = status.running;
      }
      setServerStatuses(statuses);
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  }, []);

  useEffect(() => {
    loadServers();
    // Poll status every 5s
    const interval = setInterval(loadServers, 5000);
    return () => clearInterval(interval);
  }, [loadServers]);

  useEffect(() => {
    const cleanup = window.electronAPI.onStatus((id, status) => {
      setServerStatuses(prev => ({ ...prev, [id]: status.running }));
    });
    return cleanup;
  }, []);

  const openServer = (id: string) => {
    setSelectedServer(id);
    setView('server');
  };

  const navigate = (newView: AppView) => {
    setView(newView);
    if (newView !== 'server') setSelectedServer(null);
  };

  return (
    <div className="h-screen flex flex-col bg-mc-darker">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          servers={servers}
          serverStatuses={serverStatuses}
          selectedServer={selectedServer}
          onNavigate={navigate}
          onSelectServer={openServer}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {view === 'dashboard' && (
            <Dashboard
              servers={servers}
              serverStatuses={serverStatuses}
              onSelectServer={openServer}
              onCreateServer={() => navigate('create')}
              onRefresh={loadServers}
            />
          )}
          {view === 'server' && selectedServer && (
            <ServerView
              serverId={selectedServer}
              onBack={() => navigate('dashboard')}
              onRefresh={loadServers}
            />
          )}
          {view === 'create' && (
            <CreateServer
              onBack={() => navigate('dashboard')}
              onCreated={(id) => {
                loadServers();
                openServer(id);
              }}
            />
          )}
          {view === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
