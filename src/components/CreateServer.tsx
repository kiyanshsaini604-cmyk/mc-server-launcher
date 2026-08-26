import React, { useState, useEffect } from 'react';
import type { ServerConfig } from '../types';

interface CreateServerProps {
  onBack: () => void;
  onCreated: (id: string) => void;
}

const MOD_LOADERS: { value: ServerConfig['modLoader']; label: string; description: string; icon: string; minVersion: string }[] = [
  { value: 'vanilla', label: 'Vanilla', description: 'Standard Minecraft server', icon: '🟩', minVersion: '1.0' },
  { value: 'paper', label: 'Paper', description: 'High-performance fork of Spigot', icon: '📄', minVersion: '1.7.10' },
  { value: 'spigot', label: 'Spigot', description: 'CraftBukkit-based server with plugin support', icon: '🔩', minVersion: '1.7.10' },
  { value: 'purpur', label: 'Purpur', description: 'Feature-rich fork of Paper', icon: '🟪', minVersion: '1.14' },
  { value: 'forge', label: 'Forge', description: 'Mod loader for extensive modding', icon: '⚒', minVersion: '1.8' },
  { value: 'fabric', label: 'Fabric', description: 'Lightweight mod loader for latest versions', icon: '🧵', minVersion: '1.14' },
];

const PRESETS = {
  'Small Server': { maxPlayers: 10, ram: '1G', viewDistance: 8 },
  'Medium Server': { maxPlayers: 25, ram: '2G', viewDistance: 10 },
  'Large Server': { maxPlayers: 50, ram: '4G', viewDistance: 12 },
  'Performance': { maxPlayers: 100, ram: '6G', viewDistance: 16 },
};

function versionCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export default function CreateServer({ onBack, onCreated }: CreateServerProps) {
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [javaInfo, setJavaInfo] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ message: string; percent?: number } | null>(null);
  const [allVersions, setAllVersions] = useState<{ id: string; type: string }[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);

  const [config, setConfig] = useState({
    name: '',
    version: '',
    modLoader: 'paper' as ServerConfig['modLoader'],
    port: 25565,
    maxPlayers: 20,
    ram: { min: '1G', max: '2G' },
    motd: 'Welcome to my Minecraft Server!',
    gamemode: 'survival' as const,
    difficulty: 'normal' as const,
    whitelist: false,
    onlineMode: true,
    pvp: true,
    spawnProtection: 16,
    viewDistance: 10,
    jvmArgs: ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200'],
  });

  useEffect(() => {
    window.electronAPI.findJava().then(setJavaInfo);

    // Fetch dynamic versions
    window.electronAPI.fetchVersions().then(versions => {
      setAllVersions(versions);
      // Default to latest release
      const latest = versions.find((v: any) => v.type === 'release');
      if (latest) {
        setConfig(prev => ({ ...prev, version: latest.id }));
      }
      setVersionsLoading(false);
    }).catch(() => {
      // Fallback hardcoded list
      setAllVersions([
        { id: '1.21.4', type: 'release' }, { id: '1.21.3', type: 'release' },
        { id: '1.21.2', type: 'release' }, { id: '1.21.1', type: 'release' },
        { id: '1.21', type: 'release' }, { id: '1.20.6', type: 'release' },
        { id: '1.20.4', type: 'release' }, { id: '1.20.2', type: 'release' },
        { id: '1.20.1', type: 'release' }, { id: '1.20', type: 'release' },
        { id: '1.19.4', type: 'release' }, { id: '1.18.2', type: 'release' },
        { id: '1.17.1', type: 'release' }, { id: '1.16.5', type: 'release' },
        { id: '1.12.2', type: 'release' }, { id: '1.8.9', type: 'release' },
      ]);
      setConfig(prev => ({ ...prev, version: '1.21.4' }));
      setVersionsLoading(false);
    });

    // Listen for download progress
    const cleanup = window.electronAPI.onDownloadProgress((message, percent) => {
      setDownloadProgress({ message, percent });
    });
    return cleanup;
  }, []);

  // Filter versions by mod loader compatibility
  const compatibleVersions = allVersions.filter(v => {
    if (v.type !== 'release') return false;
    const loader = MOD_LOADERS.find(l => l.value === config.modLoader);
    if (!loader) return true;
    return versionCompare(v.id, loader.minVersion) >= 0;
  });

  // Only show release versions (limit to reasonable count)
  const displayVersions = compatibleVersions.slice(0, 60);

  const update = (partial: Partial<typeof config>) => setConfig(prev => ({ ...prev, ...partial }));

  const handleCreate = async () => {
    if (!config.name.trim()) {
      setError('Server name is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const result = await window.electronAPI.createServer(config);
      if (result.success && result.config) {
        onCreated(result.config.id);
      } else {
        setError(result.error || 'Failed to create server');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const steps = [
    'Name & Version',
    'Mod Loader',
    'Configuration',
    'Review & Create',
  ];

  const inputClass = "w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-mc-accent/50 placeholder-white/20";

  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      <button onClick={onBack} className="flex items-center gap-1 text-white/40 hover:text-white/80 text-sm mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-2">Create New Server</h1>
      <p className="text-white/40 text-sm mb-8">Set up a new Minecraft server in a few steps</p>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-2 ${i <= step ? 'text-mc-accent' : 'text-white/20'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                i < step ? 'bg-mc-accent border-mc-accent text-mc-dark' :
                i === step ? 'border-mc-accent text-mc-accent' :
                'border-white/10 text-white/20'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium hidden sm:inline">{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${i < step ? 'bg-mc-accent' : 'bg-white/10'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Java Warning */}
      {!javaInfo && (
        <div className="bg-mc-yellow/10 border border-mc-yellow/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-mc-yellow text-lg">⚠</span>
          <div>
            <p className="text-mc-yellow font-medium text-sm">Java not detected</p>
            <p className="text-white/30 text-xs mt-0.5">
              You need Java 17+ to run Minecraft servers. The server will be created but won't start until Java is installed.
            </p>
          </div>
          <button
            onClick={() => window.electronAPI.installJava()}
            className="ml-auto px-3 py-1.5 bg-mc-yellow/20 hover:bg-mc-yellow/30 text-mc-yellow rounded-lg text-xs font-medium transition-colors"
          >
            Get Java
          </button>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-mc-panel rounded-xl p-6 border border-white/5 min-h-[300px]">
        {/* Step 0: Name & Version */}
        {step === 0 && (
          <div className="space-y-5 animate-slide-up">
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Server Name</label>
              <input
                type="text"
                value={config.name}
                onChange={e => update({ name: e.target.value })}
                placeholder="My Minecraft Server"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">
                Minecraft Version
                {config.modLoader !== 'vanilla' && (
                  <span className="text-mc-accent ml-2">({MOD_LOADERS.find(l => l.value === config.modLoader)?.label} compatible)</span>
                )}
              </label>
              {versionsLoading ? (
                <div className={`${inputClass} text-white/30`}>Loading versions from Mojang...</div>
              ) : (
                <select value={config.version} onChange={e => update({ version: e.target.value })} className={inputClass}>
                  {displayVersions.map(v => (
                    <option key={v.id} value={v.id}>{v.id}</option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-white/20 mt-1">
                Showing {displayVersions.length} compatible versions (filtered for {MOD_LOADERS.find(l => l.value === config.modLoader)?.label})
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Server Port</label>
              <input
                type="number"
                value={config.port}
                onChange={e => update({ port: parseInt(e.target.value) || 25565 })}
                className={inputClass}
                min={1}
                max={65535}
              />
            </div>
          </div>
        )}

        {/* Step 1: Mod Loader */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 animate-slide-up">
            {MOD_LOADERS.map(loader => (
              <button
                key={loader.value}
                onClick={() => update({ modLoader: loader.value })}
                className={`p-4 rounded-xl border text-left transition-all ${
                  config.modLoader === loader.value
                    ? 'bg-mc-accent/10 border-mc-accent/50 text-white'
                    : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{loader.icon}</span>
                  <span className="font-semibold">{loader.label}</span>
                </div>
                <p className="text-xs text-white/30">{loader.description}</p>
                <p className="text-[10px] text-white/20 mt-1">Supports MC {loader.minVersion}+</p>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <div className="space-y-5 animate-slide-up">
            {/* Presets */}
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Quick Preset</label>
              <div className="flex gap-2">
                {Object.entries(PRESETS).map(([name, preset]) => (
                  <button
                    key={name}
                    onClick={() => update({ maxPlayers: preset.maxPlayers, ram: { min: preset.ram, max: preset.ram }, viewDistance: preset.viewDistance })}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 rounded-lg text-xs transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Max Players</label>
                <input type="number" value={config.maxPlayers} onChange={e => update({ maxPlayers: parseInt(e.target.value) || 20 })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">MOTD</label>
                <input type="text" value={config.motd} onChange={e => update({ motd: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Min RAM</label>
                <input type="text" value={config.ram.min} onChange={e => update({ ram: { ...config.ram, min: e.target.value } })} className={inputClass} placeholder="1G" />
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Max RAM</label>
                <input type="text" value={config.ram.max} onChange={e => update({ ram: { ...config.ram, max: e.target.value } })} className={inputClass} placeholder="4G" />
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Gamemode</label>
                <select value={config.gamemode} onChange={e => update({ gamemode: e.target.value as any })} className={inputClass}>
                  <option value="survival">Survival</option>
                  <option value="creative">Creative</option>
                  <option value="adventure">Adventure</option>
                  <option value="spectator">Spectator</option>
                </select>
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.whitelist} onChange={e => update({ whitelist: e.target.checked })} className="accent-mc-green" />
                <span className="text-xs text-white/50">Whitelist</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.onlineMode} onChange={e => update({ onlineMode: e.target.checked })} className="accent-mc-green" />
                <span className="text-xs text-white/50">Online Mode (premium)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.pvp} onChange={e => update({ pvp: e.target.checked })} className="accent-mc-green" />
                <span className="text-xs text-white/50">PvP</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="animate-slide-up space-y-4">
            <div className="bg-white/5 rounded-lg p-4 space-y-2">
              <div className="text-lg font-bold text-white">{config.name || 'Unnamed Server'}</div>
              <div className="flex gap-3 text-xs text-white/40">
                <span>📦 {config.version}</span>
                <span>🔌 {config.modLoader}</span>
                <span>🎮 :{config.port}</span>
                <span>👥 {config.maxPlayers} players</span>
              </div>
              <div className="flex gap-3 text-xs text-white/40">
                <span>💾 {config.ram.min} - {config.ram.max}</span>
                <span>🎮 {config.gamemode}</span>
                <span>⚔ {config.difficulty}</span>
              </div>
              <p className="text-xs text-white/30 mt-2">MOTD: {config.motd}</p>
            </div>

            {/* Download Progress */}
            {creating && downloadProgress && (
              <div className="bg-mc-panel rounded-lg p-4 border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <svg className="w-4 h-4 animate-spin text-mc-accent" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm text-white/70">{downloadProgress.message}</span>
                </div>
                {downloadProgress.percent !== undefined && (
                  <div className="w-full bg-black/30 rounded-full h-1.5">
                    <div
                      className="bg-mc-accent h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-mc-red/10 border border-mc-red/20 rounded-lg p-3 text-mc-red text-sm">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : onBack()}
          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-sm transition-colors"
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-4 py-2.5 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2.5 bg-mc-green hover:bg-mc-green/80 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
          >
            {creating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {downloadProgress?.message || 'Creating...'}
              </>
            ) : (
              <>
                ⛏ Create Server
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
