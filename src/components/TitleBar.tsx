import React from 'react';

export default function TitleBar() {
  return (
    <div className="h-10 bg-mc-darker border-b border-white/5 flex items-center justify-between drag-region select-none">
      <div className="flex items-center gap-2 px-4">
        <div className="w-5 h-5 rounded bg-mc-green flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">⛏</span>
        </div>
        <span className="text-sm font-semibold text-white/80">MC Server Launcher</span>
      </div>
      <div className="flex no-drag">
        <button
          onClick={() => window.electronAPI.minimizeWindow()}
          className="w-12 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <svg width="12" height="1" viewBox="0 0 12 1" fill="white" className="opacity-60">
            <rect width="12" height="1" />
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.maximizeWindow()}
          className="w-12 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" className="opacity-60">
            <rect x="0.5" y="0.5" width="9" height="9" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.closeWindow()}
          className="w-12 h-10 flex items-center justify-center hover:bg-red-500/80 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="white" className="opacity-60">
            <line x1="0" y1="0" x2="10" y2="10" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
