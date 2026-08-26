import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MCVersion {
  id: string;
  type: string;
  releaseTime: string;
}

type LaunchPhase = 'idle' | 'downloading' | 'ready' | 'launching' | 'playing' | 'error';

export default function PlayLauncher() {
  const [versions, setVersions] = useState<MCVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [username, setUsername] = useState(() => localStorage.getItem('mc-username') || '');
  const [phase, setPhase] = useState<LaunchPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('Select a version and click Play');
  const [error, setError] = useState('');
  const [consoleLog, setConsoleLog] = useState('');
  const [javaPath, setJavaPath] = useState('');
  const [ramMin, setRamMin] = useState('256M');
  const [ramMax, setRamMax] = useState('1G');

  // Load safe RAM limits on mount
  useEffect(() => {
    window.electronAPI.mcSafeRam().then((limits: { min: string; max: string }) => {
      setRamMin(limits.min);
      setRamMax(limits.max);
    }).catch(() => {});
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<'all' | 'release' | 'snapshot'>('release');
  const consoleRef = useRef<HTMLDivElement>(null);

  // Load versions
  useEffect(() => {
    window.electronAPI.mcVersions().then((v: MCVersion[]) => {
      setVersions(v);
    }).catch(() => {
      setError('Failed to load Minecraft versions');
    });
  }, []);

  // Check game status
  useEffect(() => {
    const check = async () => {
      const status = await window.electronAPI.mcStatus();
      if (!status.running && phase === 'playing') {
        setPhase('idle');
        setProgressMsg('Game closed');
      }
    };
    const iv = setInterval(check, 2000);
    return () => clearInterval(iv);
  }, [phase]);

  // Event listeners
  useEffect(() => {
    const unsubs = [
      window.electronAPI.onMcProgress((msg: string, pct?: number) => {
        setProgressMsg(msg);
        if (pct !== undefined) setProgress(pct);
      }),
      window.electronAPI.onMcConsole((text: string) => {
        setConsoleLog(prev => prev + text);
      }),
      window.electronAPI.onMcExit((code: number) => {
        setPhase('idle');
        setProgressMsg(`Game exited with code ${code}`);
        setProgress(0);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLog]);

  const handlePlay = async () => {
    if (!username.trim()) {
      setError('Enter a username to play');
      return;
    }

    // Save username
    localStorage.setItem('mc-username', username);
    setError('');

    const versionId = selectedVersion === 'latest'
      ? versions.find(v => v.type === 'release')?.id || versions[0]?.id
      : selectedVersion;

    try {
      // Phase 1: Download
      setPhase('downloading');
      setProgress(0);
      setProgressMsg('Checking files...');
      setConsoleLog('');

      await window.electronAPI.mcDownload(versionId);

      // Phase 2: Launch
      setPhase('launching');
      setProgressMsg('Starting Minecraft...');
      await window.electronAPI.mcLaunch(versionId, username, javaPath, ramMin, ramMax);

      setPhase('playing');
      setProgress(100);
      setProgressMsg('Minecraft is running!');
    } catch (err: any) {
      setPhase('error');
      setError(err.message || 'Failed to launch');
      setProgressMsg('Launch failed');
    }
  };

  const handleKill = async () => {
    await window.electronAPI.mcKill();
    setPhase('idle');
    setProgressMsg('Game force-closed');
  };

  const filteredVersions = versions.filter(v => {
    if (filter === 'release') return v.type === 'release';
    if (filter === 'snapshot') return v.type === 'snapshot';
    return true;
  }).slice(0, 100);

  const isBusy = phase === 'downloading' || phase === 'launching';

  return (
    <div className="animate-slide-up h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🎮 Play Minecraft</h1>
          <p className="text-white/40 text-sm">Download and play Minecraft — connect to any server</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-xs transition-colors"
        >
          ⚙️ Settings
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left: Controls */}
        <div className="w-96 flex flex-col gap-4">
          {/* Username */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Player Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username..."
              className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-mc-accent text-sm"
              disabled={isBusy || phase === 'playing'}
            />
          </div>

          {/* Version Picker */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Version</label>
              <div className="flex gap-1">
                {(['release', 'snapshot', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      filter === f ? 'bg-mc-accent text-white' : 'text-white/30 hover:text-white/50'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-full px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-mc-accent text-sm mb-3"
              disabled={isBusy || phase === 'playing'}
              size={1}
            >
              <option value="latest">Latest Release</option>
              {filteredVersions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.id} ({v.type})
                </option>
              ))}
            </select>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-48">
              {filteredVersions.slice(0, 20).map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersion(v.id)}
                  disabled={isBusy || phase === 'playing'}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedVersion === v.id
                      ? 'bg-mc-accent/20 text-mc-accent border border-mc-accent/30'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                  }`}
                >
                  <div className="font-medium">{v.id}</div>
                  <div className="text-[10px] text-white/30">{v.type} • {new Date(v.releaseTime).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Play Button */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            {/* Progress bar */}
            {isBusy && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-white/40 mb-1">
                  <span>{progressMsg}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-mc-accent to-green-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                {error}
              </div>
            )}

            {phase === 'playing' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Minecraft is running!
                </div>
                <button
                  onClick={handleKill}
                  className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-bold text-sm border border-red-500/30 transition-all"
                >
                  ⏹ Force Close
                </button>
              </div>
            ) : (
              <button
                onClick={handlePlay}
                disabled={isBusy || !username.trim()}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  isBusy || !username.trim()
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-mc-accent text-white hover:from-green-400 hover:to-mc-accent shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                }`}
              >
                {isBusy ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {phase === 'downloading' ? 'Downloading...' : 'Launching...'}
                  </span>
                ) : (
                  '▶ PLAY'
                )}
              </button>
            )}

            {/* Status */}
            <div className="mt-2 text-center text-[10px] text-white/30">
              {progressMsg}
            </div>
          </div>
        </div>

        {/* Right: Console + Info */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Server Quick Join */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-2">🔗 Quick Join Server</h3>
            <p className="text-xs text-white/40 mb-3">Connect to a server from the Servers tab, or enter an address:</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="server.ip:25565"
                className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-mc-accent"
              />
              <button className="px-4 py-2 bg-mc-accent/20 text-mc-accent rounded-lg text-sm font-medium hover:bg-mc-accent/30 transition-colors">
                Connect
              </button>
            </div>
          </div>

          {/* Game Console */}
          <div className="flex-1 bg-black/30 rounded-xl border border-white/10 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <span className="text-xs font-medium text-white/40">Game Output</span>
              <button
                onClick={() => setConsoleLog('')}
                className="text-[10px] text-white/30 hover:text-white/50"
              >
                Clear
              </button>
            </div>
            <div ref={consoleRef} className="flex-1 overflow-y-auto p-4 console-font text-xs text-white/60 whitespace-pre-wrap">
              {consoleLog || (
                <div className="text-white/20 text-center py-8">
                  Game output will appear here when you launch Minecraft.
                </div>
              )}
            </div>
          </div>

          {/* Settings panel (toggle) */}
          {showSettings && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">⚙️ Launch Settings</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1">RAM Min</label>
                  <select
                    value={ramMin}
                    onChange={e => setRamMin(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-mc-accent"
                  >
                    {['512M', '1G', '2G', '3G', '4G'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">RAM Max</label>
                  <select
                    value={ramMax}
                    onChange={e => setRamMax(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-mc-accent"
                  >
                    {['2G', '4G', '6G', '8G', '12G', '16G'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Java Path (auto)</label>
                  <input
                    type="text"
                    value={javaPath}
                    onChange={e => setJavaPath(e.target.value)}
                    placeholder="Auto-detect"
                    className="w-full px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-mc-accent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
