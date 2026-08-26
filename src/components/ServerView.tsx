import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ServerConfig, ConsoleLine } from '../types';

interface ServerViewProps {
  serverId: string;
  onBack: () => void;
  onRefresh: () => void;
}

type ServerTab = 'console' | 'config' | 'mods' | 'players' | 'logs';

interface ServerMetrics {
  players: number;
  maxPlayers: number;
  memoryUsed: string;
  memoryMax: string;
  uptime: string;
  tps: string;
}

export default function ServerView({ serverId, onBack, onRefresh }: ServerViewProps) {
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<ServerTab>('console');
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ServerMetrics>({
    players: 0, maxPlayers: 20, memoryUsed: '0 MB', memoryMax: '4 GB', uptime: '0s', tps: '-',
  });
  const [deployedDefaults, setDeployedDefaults] = useState<string[]>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [config, status, consoleData] = await Promise.all([
          window.electronAPI.getServer(serverId),
          window.electronAPI.getServerStatus(serverId),
          window.electronAPI.getConsole(serverId),
        ]);
        setServer(config);
        setRunning(status.running);
        setConsoleLines(consoleData);
        // Load deployed defaults
        window.electronAPI.getDeployedDefaults(serverId).then(setDeployedDefaults);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [serverId]);

  // Event listeners with cleanup
  useEffect(() => {
    const cleanupConsole = window.electronAPI.onConsole((id, line) => {
      if (id === serverId) {
        setConsoleLines(prev => [...prev, line]);
        // Parse metrics from console output
        parseMetrics(line.message);
      }
    });
    const cleanupStatus = window.electronAPI.onStatus((id, status) => {
      if (id === serverId) {
        setRunning(status.running);
        if (status.running && !startTimeRef.current) {
          startTimeRef.current = Date.now();
        }
        if (!status.running) startTimeRef.current = 0;
      }
    });
    return () => {
      cleanupConsole();
      cleanupStatus();
    };
  }, [serverId]);

  // Uptime ticker
  useEffect(() => {
    if (!running || !startTimeRef.current) return;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setMetrics(prev => ({
        ...prev,
        uptime: h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`,
      }));
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  const parseMetrics = (msg: string) => {
    // Parse memory: [Server thread/INFO]: Used memory: 1024 MB of 4096 MB
    const memMatch = msg.match(/(?:Used|Memory)\s*(?:memory)?:?\s*(\d+)\s*(?:MB|MiB)\s*(?:of|\/)\s*(\d+)\s*(?:MB|MiB)/i);
    if (memMatch) {
      setMetrics(prev => ({
        ...prev,
        memoryUsed: `${memMatch[1]} MB`,
        memoryMax: `${memMatch[2]} MB`,
      }));
    }

    // Parse players: There are X of a max of Y players online
    const playerMatch = msg.match(/There are (\d+) of a max of (\d+) players/i);
    if (playerMatch) {
      setMetrics(prev => ({
        ...prev,
        players: parseInt(playerMatch[1]),
        maxPlayers: parseInt(playerMatch[2]),
      }));
    }

    // Parse TPS from timings or /tps output
    const tpsMatch = msg.match(/TPS\s*(?:from|:)?\s*(\d+\.?\d*)/i);
    if (tpsMatch) {
      setMetrics(prev => ({ ...prev, tps: tpsMatch[1] }));
    }
  };

  const handleStart = async () => {
    try {
      await window.electronAPI.startServer(serverId);
      setRunning(true);
      startTimeRef.current = Date.now();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStop = async () => {
    await window.electronAPI.stopServer(serverId);
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    try {
      await window.electronAPI.sendCommand(serverId, commandInput.trim());
      setConsoleLines(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `> ${commandInput}`,
        level: 'info',
      }]);
      setCommandInput('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    if (confirm('Delete this server? This cannot be undone.')) {
      await window.electronAPI.deleteServer(serverId);
      onRefresh();
      onBack();
    }
  };

  const handleBackup = async () => {
    const result = await window.electronAPI.backupServer(serverId);
    if (result?.success) {
      alert(`Backup saved to: ${result.path}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/40">Loading server...</div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40">Server not found</p>
        <button onClick={onBack} className="mt-4 text-mc-accent text-sm hover:underline">← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white/40 hover:text-white/80 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              {server.name}
              <div className={`w-2.5 h-2.5 rounded-full ${running ? 'bg-mc-accent status-pulse' : 'bg-white/20'}`} />
            </h1>
            <p className="text-white/30 text-xs">{server.version} • {server.modLoader} • :{server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!running ? (
            <button onClick={handleStart} className="px-4 py-2 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Start
            </button>
          ) : (
            <button onClick={handleStop} className="px-4 py-2 bg-mc-red hover:bg-mc-red/80 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              Stop
            </button>
          )}
          <button
            onClick={handleBackup}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-sm transition-colors"
            title="Backup server"
          >
            💾
          </button>
          <button
            onClick={async () => {
              const result = await window.electronAPI.deployDefaults(serverId);
              if (result?.deployed) setDeployedDefaults(prev => [...prev, ...result.deployed]);
            }}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-sm transition-colors"
            title="Deploy default resources"
          >
            📦
          </button>
          <button
            onClick={() => window.electronAPI.openFolder(serverId)}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-sm transition-colors"
            title="Open server folder"
          >
            📂
          </button>
          <button onClick={handleDelete} className="px-3 py-2 bg-white/5 hover:bg-mc-red/20 text-white/40 hover:text-mc-red rounded-lg text-sm transition-colors" title="Delete server">
            🗑
          </button>
        </div>
      </div>

      {/* Deployed Defaults Badge */}
      {deployedDefaults.length > 0 && (
        <div className="bg-mc-accent/5 border border-mc-accent/10 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="text-mc-accent text-xs">📦</span>
          <span className="text-[10px] text-white/40">
            {deployedDefaults.length} default resource{deployedDefaults.length > 1 ? 's' : ''} deployed:
          </span>
          <span className="text-[10px] text-mc-accent">
            {deployedDefaults.slice(0, 3).join(', ')}{deployedDefaults.length > 3 ? ` +${deployedDefaults.length - 3} more` : ''}
          </span>
        </div>
      )}

      {/* Live Metrics Bar */}
      {running && (
        <div className="bg-mc-panel rounded-lg p-3 border border-white/5 mb-4 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-white/30">Players</span>
            <span className="text-white font-medium">{metrics.players}/{server.maxPlayers}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/30">Memory</span>
            <span className="text-white font-medium">{metrics.memoryUsed}</span>
            <span className="text-white/20">/ {metrics.memoryMax}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/30">TPS</span>
            <span className={`font-medium ${parseFloat(metrics.tps) >= 18 ? 'text-mc-accent' : parseFloat(metrics.tps) >= 14 ? 'text-mc-yellow' : 'text-mc-red'}`}>
              {metrics.tps}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/30">Uptime</span>
            <span className="text-white font-medium">{metrics.uptime}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-white/5">
        {(['console', 'config', 'mods', 'players', 'logs'] as ServerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-mc-panel text-white border-b-2 border-mc-accent'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'console' && (
          <ConsoleTab
            lines={consoleLines}
            commandInput={commandInput}
            setCommandInput={setCommandInput}
            onCommand={handleCommand}
            running={running}
          />
        )}
        {tab === 'config' && server && (
          <ConfigTab server={server} serverId={serverId} onSaved={() => window.electronAPI.getServer(serverId).then(setServer)} />
        )}
        {tab === 'mods' && <ModsTab serverId={serverId} />}
        {tab === 'players' && <PlayersTab serverId={serverId} running={running} />}
        {tab === 'logs' && <LogsTab serverId={serverId} />}
      </div>
    </div>
  );
}

// ---- Console Tab ----
function ConsoleTab({ lines, commandInput, setCommandInput, onCommand, running }: {
  lines: ConsoleLine[];
  commandInput: string;
  setCommandInput: (v: string) => void;
  onCommand: (e: React.FormEvent) => void;
  running: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const getLineColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-mc-red';
      case 'warn': return 'text-mc-yellow';
      case 'debug': return 'text-white/30';
      default: return 'text-white/70';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto bg-black/30 rounded-xl p-4 border border-white/5">
        <div className="console-font">
          {lines.length === 0 && (
            <div className="text-white/20">No console output yet. {running ? 'Waiting for server...' : 'Start the server to see output.'}</div>
          )}
          {lines.map((line, i) => (
            <div key={i} className={`${getLineColor(line.level)} hover:bg-white/5`}>
              <span className="text-white/20 mr-2 text-[10px]">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
              {line.message}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <form onSubmit={onCommand} className="flex gap-2 mt-3">
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder={running ? "Type a server command... (e.g. /list, /tps)" : "Start the server first"}
          disabled={!running}
          className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white console-font placeholder-white/20 focus:outline-none focus:border-mc-accent/50 disabled:opacity-30"
        />
        <button
          type="submit"
          disabled={!running || !commandInput.trim()}
          className="px-4 py-2.5 bg-mc-green hover:bg-mc-green/80 disabled:bg-white/5 disabled:text-white/20 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ---- Config Tab ----
function ConfigTab({ server, serverId, onSaved }: { server: ServerConfig; serverId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: server.name,
    port: server.port,
    maxPlayers: server.maxPlayers,
    motd: server.motd,
    gamemode: server.gamemode,
    difficulty: server.difficulty,
    whitelist: server.whitelist,
    onlineMode: server.onlineMode,
    pvp: server.pvp,
    spawnProtection: server.spawnProtection,
    viewDistance: server.viewDistance,
    ramMin: server.ram?.min || '1G',
    ramMax: server.ram?.max || '4G',
    jvmArgs: (server.jvmArgs || []).join(' '),
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.saveServerConfig(serverId, {
        name: form.name,
        port: form.port,
        maxPlayers: form.maxPlayers,
        motd: form.motd,
        gamemode: form.gamemode,
        difficulty: form.difficulty,
        whitelist: form.whitelist,
        onlineMode: form.onlineMode,
        pvp: form.pvp,
        spawnProtection: form.spawnProtection,
        viewDistance: form.viewDistance,
        ram: { min: form.ramMin, max: form.ramMax },
        jvmArgs: form.jvmArgs.split(/\s+/).filter(Boolean),
      });
      onSaved();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-white/50">{label}</label>
      {children}
    </div>
  );

  const inputClass = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-mc-accent/50";

  return (
    <div className="max-w-2xl space-y-6 animate-slide-up overflow-y-auto max-h-full">
      <h3 className="text-lg font-semibold text-white">Server Configuration</h3>

      <div className="bg-mc-panel rounded-xl p-5 border border-white/5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Server Name">
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} />
          </Field>
          <Field label="Port">
            <input type="number" value={form.port} onChange={e => setForm({...form, port: parseInt(e.target.value) || 25565})} className={inputClass} />
          </Field>
          <Field label="Max Players">
            <input type="number" value={form.maxPlayers} onChange={e => setForm({...form, maxPlayers: parseInt(e.target.value) || 20})} className={inputClass} />
          </Field>
          <Field label="MOTD">
            <input type="text" value={form.motd} onChange={e => setForm({...form, motd: e.target.value})} className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="bg-mc-panel rounded-xl p-5 border border-white/5 space-y-4">
        <h4 className="text-sm font-semibold text-white/70">Game Settings</h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Gamemode">
            <select value={form.gamemode} onChange={e => setForm({...form, gamemode: e.target.value as any})} className={inputClass}>
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="adventure">Adventure</option>
              <option value="spectator">Spectator</option>
            </select>
          </Field>
          <Field label="Difficulty">
            <select value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value as any})} className={inputClass}>
              <option value="peaceful">Peaceful</option>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="View Distance">
            <input type="number" value={form.viewDistance} onChange={e => setForm({...form, viewDistance: parseInt(e.target.value) || 10})} className={inputClass} min={2} max={32} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.whitelist} onChange={e => setForm({...form, whitelist: e.target.checked})} className="accent-mc-green" />
            <label className="text-xs text-white/50">Whitelist</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.onlineMode} onChange={e => setForm({...form, onlineMode: e.target.checked})} className="accent-mc-green" />
            <label className="text-xs text-white/50">Online Mode</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.pvp} onChange={e => setForm({...form, pvp: e.target.checked})} className="accent-mc-green" />
            <label className="text-xs text-white/50">PvP</label>
          </div>
        </div>
      </div>

      <div className="bg-mc-panel rounded-xl p-5 border border-white/5 space-y-4">
        <h4 className="text-sm font-semibold text-white/70">JVM Settings</h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min RAM">
            <input type="text" value={form.ramMin} onChange={e => setForm({...form, ramMin: e.target.value})} className={inputClass} placeholder="1G" />
          </Field>
          <Field label="Max RAM">
            <input type="text" value={form.ramMax} onChange={e => setForm({...form, ramMax: e.target.value})} className={inputClass} placeholder="4G" />
          </Field>
        </div>
        <Field label="Additional JVM Arguments">
          <input type="text" value={form.jvmArgs} onChange={e => setForm({...form, jvmArgs: e.target.value})} className={inputClass} placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled" />
        </Field>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2.5 bg-mc-green hover:bg-mc-green/80 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
}

// ---- Mods Tab with Drag & Drop ----
function ModsTab({ serverId }: { serverId: string }) {
  const [mods, setMods] = useState<{ name: string; size: number; modified: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const loadMods = async () => {
    const list = await window.electronAPI.listMods(serverId);
    setMods(list);
    setLoading(false);
  };

  useEffect(() => { loadMods(); }, [serverId]);

  const handleUpload = async () => {
    const result = await window.electronAPI.uploadMods(serverId);
    if (result.success) loadMods();
  };

  const handleDelete = async (name: string) => {
    if (confirm(`Delete ${name}?`)) {
      await window.electronAPI.deleteMod(serverId, name);
      loadMods();
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.jar'));
    if (files.length === 0) {
      alert('Only .jar files can be uploaded as mods/plugins.');
      return;
    }
    // Upload via the dialog API since we can't access file paths from renderer
    // Fallback: use the upload dialog
    const result = await window.electronAPI.uploadMods(serverId);
    if (result.success) loadMods();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Mods & Plugins ({mods.length})</h3>
        <button onClick={handleUpload} className="px-4 py-2 bg-mc-green hover:bg-mc-green/80 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add JARs
        </button>
      </div>

      {loading ? (
        <div className="text-white/40 py-8 text-center">Loading...</div>
      ) : mods.length === 0 && !dragOver ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="bg-mc-panel rounded-xl p-12 border-2 border-dashed border-white/10 text-center hover:border-mc-accent/30 transition-colors cursor-pointer"
          onClick={handleUpload}
        >
          <div className="text-3xl mb-3">📦</div>
          <p className="text-white/40 text-sm mb-2">No mods or plugins installed</p>
          <p className="text-white/20 text-xs">Click to browse or drag & drop .jar files here</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`space-y-2 ${dragOver ? 'ring-2 ring-mc-accent/50 rounded-xl p-2' : ''}`}
        >
          {mods.map((mod) => (
            <div key={mod.name} className="bg-mc-panel rounded-lg p-3 border border-white/5 flex items-center justify-between hover:border-white/10 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-lg">📦</span>
                <div>
                  <div className="text-sm font-medium text-white">{mod.name}</div>
                  <div className="text-[10px] text-white/30">
                    {formatSize(mod.size)} • Added {new Date(mod.modified).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(mod.name)}
                className="px-2 py-1 text-white/30 hover:text-mc-red hover:bg-mc-red/10 rounded transition-colors text-xs"
              >
                Delete
              </button>
            </div>
          ))}
          {dragOver && (
            <div className="bg-mc-accent/10 border-2 border-dashed border-mc-accent/50 rounded-xl p-8 text-center">
              <p className="text-mc-accent text-sm font-medium">Drop .jar files to install</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Players Tab ----
function PlayersTab({ serverId, running }: { serverId: string; running: boolean }) {
  const [players, setPlayers] = useState<{ ops: any[]; whitelist: any[]; banned: any[] }>({ ops: [], whitelist: [], banned: [] });
  const [activeTab, setActiveTab] = useState<'ops' | 'whitelist' | 'banned'>('ops');

  useEffect(() => {
    window.electronAPI.listPlayers(serverId).then(setPlayers);
  }, [serverId, running]);

  return (
    <div className="animate-slide-up">
      <div className="flex gap-2 mb-4">
        {(['ops', 'whitelist', 'banned'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t ? 'bg-mc-panel text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t === 'ops' ? '⚡ Operators' : t === 'whitelist' ? '✓ Whitelist' : '🚫 Banned'} ({players[t].length})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {players[activeTab].length === 0 ? (
          <div className="bg-mc-panel rounded-xl p-8 border border-white/5 text-center text-white/30 text-sm">
            No {activeTab} players
          </div>
        ) : (
          players[activeTab].map((player: any, i: number) => (
            <div key={i} className="bg-mc-panel rounded-lg p-3 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-sm">
                  👤
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{player.name || player.uuid}</div>
                  <div className="text-[10px] text-white/30">UUID: {player.uuid}</div>
                </div>
              </div>
              {running && activeTab === 'banned' && (
                <button
                  onClick={() => window.electronAPI.pardonPlayer(serverId, player.uuid).then(() => window.electronAPI.listPlayers(serverId).then(setPlayers))}
                  className="px-2 py-1 text-mc-accent hover:bg-mc-accent/10 rounded text-xs transition-colors"
                >
                  Pardon
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {running && (
        <div className="mt-4 bg-mc-panel rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/30 mb-2">Quick actions (server must be running)</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Player name or UUID"
              id="player-action-input"
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-mc-accent/50"
            />
            <button
              onClick={async () => {
                const input = document.getElementById('player-action-input') as HTMLInputElement;
                const val = input?.value.trim();
                if (val) {
                  await window.electronAPI.kickPlayer(serverId, val);
                  input.value = '';
                }
              }}
              className="px-3 py-2 bg-mc-yellow/20 text-mc-yellow hover:bg-mc-yellow/30 rounded-lg text-xs font-medium transition-colors"
            >
              Kick
            </button>
            <button
              onClick={async () => {
                const input = document.getElementById('player-action-input') as HTMLInputElement;
                const val = input?.value.trim();
                if (val) {
                  await window.electronAPI.banPlayer(serverId, val);
                  input.value = '';
                }
              }}
              className="px-3 py-2 bg-mc-red/20 text-mc-red hover:bg-mc-red/30 rounded-lg text-xs font-medium transition-colors"
            >
              Ban
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Logs Tab ----
function LogsTab({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getLogs(serverId).then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, [serverId]);

  return (
    <div className="animate-slide-up h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Server Logs</h3>
        <button
          onClick={() => window.electronAPI.getLogs(serverId).then(setLogs)}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-xs transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-black/30 rounded-xl p-4 border border-white/5">
        {loading ? (
          <div className="text-white/40">Loading logs...</div>
        ) : logs ? (
          <pre className="console-font text-white/70 whitespace-pre-wrap">{logs}</pre>
        ) : (
          <div className="text-white/20">No logs found. Start the server to generate logs.</div>
        )}
      </div>
    </div>
  );
}
