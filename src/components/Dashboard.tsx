import React, { useEffect, useState } from 'react';
import type { ServerConfig } from '../types';

interface DashboardProps {
  servers: ServerConfig[];
  serverStatuses: Record<string, boolean>;
  onSelectServer: (id: string) => void;
  onCreateServer: () => void;
  onRefresh: () => void;
}

export default function Dashboard({ servers, serverStatuses, onSelectServer, onCreateServer, onRefresh }: DashboardProps) {
  const [javaInfo, setJavaInfo] = useState<{ path: string; version: string; is64Bit: boolean } | null>(null);
  const [javaLoading, setJavaLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.findJava().then(info => {
      setJavaInfo(info);
      setJavaLoading(false);
    });
  }, []);

  const runningCount = Object.values(serverStatuses).filter(Boolean).length;

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Manage your Minecraft servers</p>
        </div>
        <button
          onClick={onCreateServer}
          className="flex items-center gap-2 px-4 py-2.5 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg font-medium text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Server
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-mc-panel rounded-xl p-4 border border-white/5">
          <div className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">Total Servers</div>
          <div className="text-3xl font-bold text-white">{servers.length}</div>
        </div>
        <div className="bg-mc-panel rounded-xl p-4 border border-white/5">
          <div className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">Running</div>
          <div className="text-3xl font-bold text-mc-accent">{runningCount}</div>
        </div>
        <div className="bg-mc-panel rounded-xl p-4 border border-white/5">
          <div className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">Java</div>
          {javaLoading ? (
            <div className="text-3xl font-bold text-white/20">...</div>
          ) : javaInfo ? (
            <div>
              <div className="text-3xl font-bold text-mc-green">✓</div>
              <div className="text-[10px] text-white/40 mt-1">Java {javaInfo.version} ({javaInfo.is64Bit ? '64-bit' : '32-bit'})</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-bold text-mc-red">✗</div>
              <div className="text-[10px] text-mc-red mt-1">Not found</div>
            </div>
          )}
        </div>
      </div>

      {/* Java Warning */}
      {!javaLoading && !javaInfo && (
        <div className="bg-mc-red/10 border border-mc-red/20 rounded-xl p-4 mb-8 flex items-center gap-3">
          <div className="text-mc-red text-xl">⚠</div>
          <div>
            <p className="text-mc-red font-medium text-sm">Java not found</p>
            <p className="text-white/40 text-xs mt-0.5">Install Java 17+ to run Minecraft servers. </p>
          </div>
          <button
            onClick={() => window.electronAPI.installJava()}
            className="ml-auto px-3 py-1.5 bg-mc-red/20 hover:bg-mc-red/30 text-mc-red rounded-lg text-xs font-medium transition-colors"
          >
            Get Java
          </button>
        </div>
      )}

      {/* Server Cards */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white mb-4">Your Servers</h2>
        {servers.length === 0 ? (
          <div className="bg-mc-panel rounded-xl p-12 border border-white/5 text-center">
            <div className="text-4xl mb-4">⛏</div>
            <h3 className="text-white/60 font-medium mb-2">No servers yet</h3>
            <p className="text-white/30 text-sm mb-4">Create your first Minecraft server to get started</p>
            <button
              onClick={onCreateServer}
              className="px-4 py-2 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Create Your First Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => onSelectServer(server.id)}
                className="bg-mc-panel rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      serverStatuses[server.id] ? 'bg-mc-accent status-pulse' : 'bg-white/20'
                    }`} />
                    <h3 className="font-semibold text-white group-hover:text-mc-accent transition-colors">
                      {server.name}
                    </h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    serverStatuses[server.id]
                      ? 'bg-mc-accent/20 text-mc-accent'
                      : 'bg-white/5 text-white/40'
                  }`}>
                    {serverStatuses[server.id] ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-white/30">
                  <span>📦 {server.version}</span>
                  <span>🔌 {server.modLoader}</span>
                  <span>🎮 :{server.port}</span>
                  <span>💾 {server.ram?.max || '4G'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
