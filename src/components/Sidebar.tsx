import React from 'react';
import type { ServerConfig, AppView } from '../types';

interface SidebarProps {
  view: AppView;
  servers: ServerConfig[];
  serverStatuses: Record<string, boolean>;
  selectedServer: string | null;
  onNavigate: (view: AppView) => void;
  onSelectServer: (id: string) => void;
}

export default function Sidebar({ view, servers, serverStatuses, selectedServer, onNavigate, onSelectServer }: SidebarProps) {
  return (
    <div className="w-64 bg-mc-panel border-r border-white/5 flex flex-col">
      {/* Nav items */}
      <div className="p-3 space-y-1">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            view === 'dashboard' ? 'bg-mc-green/20 text-mc-accent' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </button>
        <button
          onClick={() => onNavigate('play')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            view === 'play' ? 'bg-mc-green/20 text-mc-accent' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Play Minecraft
        </button>
        <button
          onClick={() => onNavigate('create')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            view === 'create' ? 'bg-mc-green/20 text-mc-accent' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Server
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 border-t border-white/5" />

      {/* Server list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider px-3 mb-2">
          Servers ({servers.length})
        </p>
        {servers.map((server) => (
          <button
            key={server.id}
            onClick={() => onSelectServer(server.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              selectedServer === server.id
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              serverStatuses[server.id] ? 'bg-mc-accent status-pulse' : 'bg-white/20'
            }`} />
            <div className="flex-1 text-left truncate">
              <div className="font-medium truncate">{server.name}</div>
              <div className="text-[10px] text-white/30">{server.version} • {server.modLoader}</div>
            </div>
          </button>
        ))}
        {servers.length === 0 && (
          <div className="text-center py-8 text-white/20 text-xs">
            No servers yet.<br />Create one to get started!
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="p-3 border-t border-white/5">
        <button
          onClick={async () => {
            const result = await window.electronAPI.restoreServer();
            if (result?.success) {
              onNavigate('dashboard');
              window.location.reload();
            }
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white/80 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Restore Backup
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            view === 'settings' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}
