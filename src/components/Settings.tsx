import React, { useEffect, useState } from 'react';

interface ModrinthDefault {
  modrinthId: string;
  slug: string;
  label: string;
  description: string;
  downloads: number;
  icon?: string | null;
  modLoader?: string[];
}

interface DefaultsConfig {
  resourcePacks: ModrinthDefault[];
  shaderPacks: ModrinthDefault[];
  mods: ModrinthDefault[];
}

export default function Settings() {
  const [javaInfo, setJavaInfo] = useState<{ path: string; version: string; is64Bit: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [defaults, setDefaults] = useState<DefaultsConfig | null>(null);
  const [deployResult, setDeployResult] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.findJava().then(info => {
      setJavaInfo(info);
      setLoading(false);
    });
    window.electronAPI.getSystemInfo().then(setSysInfo);
    window.electronAPI.getDefaults().then(setDefaults);
  }, []);

  const handleDeployAll = async () => {
    setDeployResult(null);
    const result = await window.electronAPI.deployDefaultsAll();
    if (result?.success) {
      const count = result.results?.reduce((sum: number, r: any) => sum + r.deployed.length, 0) || 0;
      setDeployResult(`Deployed ${count} defaults to ${result.results?.length || 0} servers`);
    }
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDownloads = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };

  const renderPackCard = (pack: ModrinthDefault, type: 'resourcepacks' | 'shaderpacks' | 'mods') => (
    <div key={pack.modrinthId} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5">
      {pack.icon ? (
        <img src={pack.icon} alt="" className="w-8 h-8 rounded-md object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-sm">
          {type === 'resourcepacks' ? '🎨' : type === 'shaderpacks' ? '✨' : '🔧'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/80 font-medium truncate">{pack.label}</div>
        <div className="text-[10px] text-white/30 truncate">{pack.description}</div>
        {pack.modLoader && (
          <div className="text-[10px] text-mc-accent mt-0.5">
            {pack.modLoader.join(', ')} only
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        {pack.downloads > 0 && (
          <div className="text-[10px] text-white/20">{formatDownloads(pack.downloads)} downloads</div>
        )}
        <a
          href={`https://modrinth.com/${type === 'mods' ? 'mod' : type === 'shaderpacks' ? 'shader' : 'resourcepack'}/${pack.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-mc-accent hover:underline"
        >
          View on Modrinth ↗
        </a>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl animate-slide-up">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-white/40 text-sm mb-8">Launcher configuration and system info</p>

      {/* Java */}
      <div className="bg-mc-panel rounded-xl p-5 border border-white/5 mb-4">
        <h3 className="text-sm font-semibold text-white/70 mb-4">Java Runtime</h3>
        {loading ? (
          <div className="text-white/30 text-sm">Detecting Java...</div>
        ) : javaInfo ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mc-accent" />
              <span className="text-sm text-white font-medium">Java Found</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-white/40">Path:</span>
                <p className="text-white/70 font-mono text-[11px] mt-0.5 break-all">{javaInfo.path}</p>
              </div>
              <div>
                <span className="text-white/40">Version:</span>
                <p className="text-white/70 mt-0.5">{javaInfo.version}</p>
              </div>
              <div>
                <span className="text-white/40">Architecture:</span>
                <p className="text-white/70 mt-0.5">{javaInfo.is64Bit ? '64-bit' : '32-bit'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mc-red" />
              <span className="text-sm text-mc-red font-medium">Java Not Found</span>
            </div>
            <p className="text-xs text-white/40">
              Install Java 17+ to run Minecraft servers. We recommend Eclipse Temurin (Adoptium).
            </p>
            <button
              onClick={() => window.electronAPI.installJava()}
              className="px-4 py-2 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Download Java
            </button>
          </div>
        )}
      </div>

      {/* System Info */}
      {sysInfo && (
        <div className="bg-mc-panel rounded-xl p-5 border border-white/5 mb-4">
          <h3 className="text-sm font-semibold text-white/70 mb-4">System Info</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-white/40">Platform:</span>
              <p className="text-white/70 mt-0.5">{sysInfo.platform} ({sysInfo.arch})</p>
            </div>
            <div>
              <span className="text-white/40">Hostname:</span>
              <p className="text-white/70 mt-0.5">{sysInfo.hostname}</p>
            </div>
            <div>
              <span className="text-white/40">CPU:</span>
              <p className="text-white/70 mt-0.5">{sysInfo.cpuModel}</p>
            </div>
            <div>
              <span className="text-white/40">CPU Cores:</span>
              <p className="text-white/70 mt-0.5">{sysInfo.cpus} cores</p>
            </div>
            <div>
              <span className="text-white/40">Total Memory:</span>
              <p className="text-white/70 mt-0.5">{formatBytes(sysInfo.totalMemory)}</p>
            </div>
            <div>
              <span className="text-white/40">Free Memory:</span>
              <p className="text-white/70 mt-0.5">{formatBytes(sysInfo.freeMemory)}</p>
            </div>
            <div>
              <span className="text-white/40">System Uptime:</span>
              <p className="text-white/70 mt-0.5">{formatUptime(sysInfo.uptime)}</p>
            </div>
            <div>
              <span className="text-white/40">User Agent:</span>
              <p className="text-white/70 mt-0.5 truncate" title={navigator.userAgent}>{navigator.userAgent.split(') ')[0]})</p>
            </div>
          </div>

          {/* Memory Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-white/30 mb-1">
              <span>Memory Usage</span>
              <span>{formatBytes(sysInfo.totalMemory - sysInfo.freeMemory)} / {formatBytes(sysInfo.totalMemory)}</span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  ((sysInfo.totalMemory - sysInfo.freeMemory) / sysInfo.totalMemory) > 0.85
                    ? 'bg-mc-red'
                    : ((sysInfo.totalMemory - sysInfo.freeMemory) / sysInfo.totalMemory) > 0.7
                    ? 'bg-mc-yellow'
                    : 'bg-mc-accent'
                }`}
                style={{ width: `${Math.round(((sysInfo.totalMemory - sysInfo.freeMemory) / sysInfo.totalMemory) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Default Resources */}
      <div className="bg-mc-panel rounded-xl p-5 border border-white/5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white/70">Default Resources</h3>
          <button
            onClick={handleDeployAll}
            className="px-3 py-1.5 bg-mc-green/20 hover:bg-mc-green/30 text-mc-accent rounded-lg text-xs font-medium transition-colors"
          >
            Deploy to All Servers
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">
          These packs are downloaded from Modrinth automatically when creating a server.
          The correct version for your MC version is fetched each time.
        </p>

        {deployResult && (
          <div className="bg-mc-accent/10 border border-mc-accent/20 rounded-lg p-3 text-mc-accent text-xs mb-4">
            ✓ {deployResult}
          </div>
        )}

        {defaults && (
          <div className="space-y-5">
            {/* Resource Packs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-medium">
                  🎨 Resource Packs ({defaults.resourcePacks?.length || 0})
                </span>
              </div>
              <div className="space-y-1.5">
                {(defaults.resourcePacks || []).map((p) => renderPackCard(p, 'resourcepacks'))}
              </div>
            </div>

            {/* Shader Packs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-medium">
                  ✨ Shader Packs ({defaults.shaderPacks?.length || 0})
                </span>
              </div>
              <div className="space-y-1.5">
                {(defaults.shaderPacks || []).map((p) => renderPackCard(p, 'shaderpacks'))}
              </div>
            </div>

            {/* Mods */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-medium">
                  🔧 Mods ({defaults.mods?.length || 0})
                </span>
              </div>
              <div className="space-y-1.5">
                {(defaults.mods || []).map((p) => renderPackCard(p, 'mods'))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 bg-white/5 rounded-lg p-3">
          <p className="text-[10px] text-white/30">
            💡 All packs are sourced from Modrinth. The launcher automatically downloads the correct version
            for your server's MC version. Resource packs are auto-configured in server.properties.
          </p>
        </div>
      </div>

      {/* About */}
      <div className="bg-mc-panel rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white/70 mb-4">About</h3>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-mc-green flex items-center justify-center text-xl">⛏</div>
          <div>
            <div className="text-sm font-bold text-white">MC Server Launcher</div>
            <div className="text-[10px] text-white/30">v1.0.0 • Built with Electron + React</div>
          </div>
        </div>
        <p className="text-xs text-white/40">
          Host Minecraft servers from your own laptop. Supports Vanilla, Paper, Spigot, Purpur,
          Forge, and Fabric. Default packs auto-downloaded from Modrinth for every MC version.
        </p>
      </div>
    </div>
  );
}
