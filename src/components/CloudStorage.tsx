import React, { useState, useEffect, useCallback } from 'react';

interface CloudFile {
  fs_id: number;
  path: string;
  server_filename: string;
  size: number;
  isdir: number;
  server_mtime: number;
}

export default function CloudStorage() {
  const [configured, setConfigured] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [ndus, setNdus] = useState('');
  const [jsToken, setJsToken] = useState('');
  const [appId, setAppId] = useState('250528');
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [currentDir, setCurrentDir] = useState('/');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    window.electronAPI.cloudStatus().then((s: any) => {
      setConfigured(s.configured);
      if (s.configured) loadFiles('/');
    });
    const unsub = window.electronAPI.onCloudProgress((data: any) => {
      if (data.message) setProgress({ message: data.message, percent: data.percent || 0 });
      else if (data.percent !== undefined) setProgress({ message: `Uploading... ${data.percent}%`, percent: data.percent });
    });
    return unsub;
  }, []);

  const loadFiles = async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const list = await window.electronAPI.cloudList(dir);
      setFiles(list || []);
      setCurrentDir(dir);
    } catch (err: any) {
      setError(err.message || 'Failed to list files');
    }
    setLoading(false);
  };

  const handleConfigure = async () => {
    if (!ndus || !jsToken) { setError('ndus and jsToken are required'); return; }
    setError('');
    try {
      await window.electronAPI.cloudConfigure({ ndus, jsToken, appId: appId || '250528' });
      setConfigured(true);
      setShowSetup(false);
      loadFiles('/');
    } catch (err: any) {
      setError(err.message || 'Failed to configure');
    }
  };

  const navigateUp = () => {
    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
    loadFiles(parent);
  };

  const navigateDir = (name: string) => {
    loadFiles(currentDir === '/' ? `/${name}` : `${currentDir}/${name}`);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  const formatDate = (ts: number): string => {
    return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const btnClass = 'px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm';

  if (!configured && !showSetup) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#2a2a4a]">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">☁️</span>
          <div>
            <h3 className="text-white font-semibold text-lg">Cloud Storage</h3>
            <p className="text-gray-400 text-sm">1TB free via TeraBox — backup servers to the cloud</p>
          </div>
        </div>
        <button onClick={() => setShowSetup(true)} className={`${btnClass} bg-green-600 hover:bg-green-500 text-white`}>
          ⚡ Connect TeraBox
        </button>
      </div>
    );
  }

  if (showSetup || !configured) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#2a2a4a]">
        <h3 className="text-white font-semibold text-lg mb-4">☁️ Connect TeraBox (1TB Free)</h3>
        {error && <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm mb-4">{error}</div>}

        <div className="bg-[#12121f] rounded-lg p-4 mb-4 text-sm text-gray-300">
          <p className="font-semibold text-white mb-2">📋 How to get your credentials:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open <a href="https://www.terabox.com" target="_blank" className="text-green-400 underline">terabox.com</a> and log in</li>
            <li>Press <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">F12</kbd> to open DevTools</li>
            <li>Go to <strong>Application → Cookies → terabox.com</strong></li>
            <li>Find <code className="bg-gray-700 px-1 rounded text-green-300">ndus</code> — copy its value</li>
            <li>Go to <strong>Network</strong> tab, click any API request</li>
            <li>In the URL, find <code className="bg-gray-700 px-1 rounded text-green-300">jsToken=</code> — copy the value</li>
          </ol>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">ndus (from Cookie)</label>
            <input value={ndus} onChange={e => setNdus(e.target.value)} placeholder="Paste ndus value..."
              className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">jsToken (from URL)</label>
            <input value={jsToken} onChange={e => setJsToken(e.target.value)} placeholder="Paste jsToken value..."
              className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">appId (usually 250528)</label>
            <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="250528"
              className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={handleConfigure} className={`${btnClass} bg-green-600 hover:bg-green-500 text-white`}>✓ Connect</button>
          <button onClick={() => { setShowSetup(false); setError(''); }} className={`${btnClass} bg-gray-700 hover:bg-gray-600 text-gray-300`}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#2a2a4a]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">☁️</span>
          <div>
            <h3 className="text-white font-semibold text-lg">Cloud Storage</h3>
            <p className="text-gray-400 text-sm">TeraBox • 1TB Free</p>
          </div>
        </div>
        <button onClick={() => loadFiles(currentDir)} className={`${btnClass} bg-gray-700 hover:bg-gray-600 text-gray-300`}>🔄 Refresh</button>
      </div>

      {progress && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4">
          <div className="flex justify-between text-sm text-green-300 mb-1">
            <span>{progress.message}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-3 text-sm">
        <button onClick={() => loadFiles('/')} className="text-green-400 hover:text-green-300">☁️ Home</button>
        {currentDir !== '/' && currentDir.split('/').filter(Boolean).map((part, i, arr) => {
          const dirPath = '/' + arr.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1">
              <span className="text-gray-500">/</span>
              <button onClick={() => loadFiles(dirPath)} className="text-green-400 hover:text-green-300">{part}</button>
            </span>
          );
        })}
      </div>

      {/* File List */}
      <div className="bg-[#12121f] rounded-lg border border-[#2a2a4a] overflow-hidden">
        {currentDir !== '/' && (
          <div onClick={navigateUp}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a2e] cursor-pointer border-b border-[#2a2a4a] text-gray-400">
            <span>📁</span><span className="text-sm">..</span>
          </div>
        )}
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">No files yet. Upload server backups to get started!</div>
        ) : (
          files.sort((a, b) => b.isdir - a.isdir || a.server_filename.localeCompare(b.server_filename)).map(f => (
            <div key={f.fs_id}
              onClick={() => f.isdir ? navigateDir(f.server_filename) : undefined}
              className={`flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a4a] last:border-0 ${f.isdir ? 'cursor-pointer hover:bg-[#1a1a2e]' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{f.isdir ? '📁' : '📄'}</span>
                <span className="text-white text-sm truncate">{f.server_filename}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                {!f.isdir && <span>{formatSize(f.size)}</span>}
                <span>{formatDate(f.server_mtime)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-gray-500 mt-3">
        {files.length} items • {formatSize(files.filter(f => !f.isdir).reduce((s, f) => s + f.size, 0))} used
      </div>
    </div>
  );
}
