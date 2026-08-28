import { BrowserWindow } from 'electron';

let keepAliveInterval: NodeJS.Timeout | null = null;
let currentConfig: any = null;
let currentMainWindow: BrowserWindow | null = null;

interface BotConfig {
  host: string;
  port: number;
  username: string;
  version: string;
  serverId: string;
}

function sendLog(msg: string, level: 'info' | 'error' = 'info') {
  if (currentMainWindow && currentConfig) {
    currentMainWindow.webContents.send('server:console', currentConfig.serverId, {
      timestamp: new Date().toISOString(),
      message: `[BOT] ${msg}`,
      level,
    });
  }
}

function sendCommand(serverId: string, command: string): boolean {
  try {
    const serverProcesses = (global as any).__serverProcesses;
    if (!serverProcesses) return false;
    const proc = serverProcesses.get(serverId);
    if (!proc || !proc.stdin || proc.stdin.destroyed) return false;
    proc.stdin.write(command + '\n');
    return true;
  } catch {
    return false;
  }
}

// Start the keep-alive bot — uses direct server console commands
// Works with ANY Minecraft version (no mineflayer needed)
export function startBot(config: BotConfig, mainWindow: BrowserWindow | null): { success: boolean } {
  if (keepAliveInterval) {
    stopBot();
  }

  currentConfig = config;
  currentMainWindow = mainWindow;

  sendLog(`Starting 24/7 keep-alive bot on ${config.host}:${config.port}...`);

  // Test that server is running
  const ok = sendCommand(config.serverId, 'list');
  if (!ok) {
    sendLog('Server is not running! Start the server first.', 'error');
    return { success: false };
  }

  let tick = 0;

  // Keep alive every 60 seconds
  keepAliveInterval = setInterval(() => {
    tick++;

    // Check if server is still running
    const serverProcesses = (global as any).__serverProcesses;
    const proc = serverProcesses?.get(config.serverId);
    if (!proc || proc.killed) {
      sendLog('Server process died — stopping keep-alive', 'error');
      stopBot();
      mainWindow?.webContents.send('bot:status', { active: false, serverId: config.serverId });
      return;
    }

    // Send commands to keep server alive
    if (tick % 1 === 0) {
      // Every tick (60s): say command keeps world ticking
      sendCommand(config.serverId, 'say ⚡');
    }

    if (tick % 5 === 0) {
      // Every 5 minutes: list players
      sendCommand(config.serverId, 'list');
    }

    if (tick % 10 === 0) {
      // Every 10 minutes: save the world
      sendCommand(config.serverId, 'save-all');
    }
  }, 60000); // Every 60 seconds

  // Log immediately
  sendLog('✅ 24/7 mode ACTIVATED — server will stay alive');
  sendLog('Bot pings server every 60s to prevent shutdown');
  mainWindow?.webContents.send('bot:status', { active: true, serverId: config.serverId });

  return { success: true };
}

// Stop the keep-alive bot
export function stopBot(): { success: boolean } {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  if (currentConfig && currentMainWindow) {
    sendLog('24/7 mode DEACTIVATED — bot stopped');
  }

  currentConfig = null;
  currentMainWindow = null;

  return { success: true };
}

// Check if bot is active
export function isBotActive(): boolean {
  return keepAliveInterval !== null;
}
