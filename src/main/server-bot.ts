import { BrowserWindow } from 'electron';
import { spawnSync } from 'child_process';

let bot: any = null;
let botInterval: NodeJS.Timeout | null = null;
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

// Start the keep-alive bot
export async function startBot(config: BotConfig, mainWindow: BrowserWindow | null): Promise<{ success: boolean }> {
  if (bot || keepAliveInterval) {
    stopBot();
  }

  currentConfig = config;
  currentMainWindow = mainWindow;

  sendLog(`Starting keep-alive bot on ${config.host}:${config.port}...`);

  // Try mineflayer first (works for most versions)
  try {
    const mineflayer = (await import('mineflayer' as any)).default;

    bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username || 'ServerBot',
      version: false, // Auto-detect
      hideErrors: true,
      reconnect: true,
    });

    bot.on('spawn', () => {
      sendLog('Bot joined the server! Server will stay alive 24/7.');
      mainWindow?.webContents.send('bot:status', { active: true, serverId: config.serverId });
    });

    bot.on('error', (err: any) => {
      // If mineflayer can't handle this version, fall back
      if (err.message && (err.message.includes('unsupported') || err.message.includes('protocol') || err.message.includes('version'))) {
        sendLog('mineflayer does not support this MC version — switching to keep-alive mode', 'error');
        bot?.quit();
        bot = null;
        startKeepAliveFallback(config, mainWindow);
        return;
      }
      sendLog(`Bot error: ${err.message}`, 'error');
    });

    bot.on('kicked', (reason: any) => {
      sendLog(`Bot kicked: ${reason}`);
      // Auto-reconnect handled by mineflayer
    });

    bot.on('end', () => {
      if (bot) {
        sendLog('Bot disconnected — reconnecting in 15s...');
        bot = null;
        setTimeout(() => {
          if (currentConfig) startBot(currentConfig, currentMainWindow);
        }, 15000);
      } else {
        mainWindow?.webContents.send('bot:status', { active: false, serverId: config.serverId });
      }
    });

    // Keep alive: move every 5 minutes
    botInterval = setInterval(() => {
      if (bot && bot.entity) {
        try {
          bot.setControlState('forward', true);
          setTimeout(() => {
            if (bot) bot.setControlState('forward', false);
          }, 200);
        } catch {}
      }
    }, 300000);

    return { success: true };

  } catch (err: any) {
    // mineflayer import failed — fall back to keep-alive mode
    sendLog(`mineflayer unavailable (${err.message}) — using keep-alive mode`);
    startKeepAliveFallback(config, mainWindow);
    return { success: true };
  }
}

// Fallback: keep server alive by periodically running console commands
// This works with ANY MC version since it uses the server's stdin
function startKeepAliveFallback(config: BotConfig, mainWindow: BrowserWindow | null) {
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  let tickCount = 0;

  keepAliveInterval = setInterval(() => {
    tickCount++;

    // Send a harmless command to keep the server busy
    // /list shows player count — server can't shut down while processing
    // /say broadcasts a message — keeps world ticking
    try {
      // Use Electron IPC to send command to running server
      mainWindow?.webContents.send('server:keep-alive-ping', config.serverId);

      // Every 5 ticks (~2.5 min), send a say command via process stdin
      // We need to access the server process — send event to index.ts
      const { app } = require('electron');
      // Access server process via global reference (set in index.ts)
      const serverProcesses = (global as any).__serverProcesses;
      if (serverProcesses) {
        const proc = serverProcesses.get(config.serverId);
        if (proc && proc.stdin && !proc.stdin.destroyed) {
          if (tickCount % 5 === 0) {
            proc.stdin.write('say ⚡ Keep-alive ping\n');
          }
          if (tickCount % 10 === 0) {
            proc.stdin.write('list\n');
          }
        } else {
          // Server is not running — stop the keep-alive
          sendLog('Server stopped — disabling keep-alive', 'error');
          stopBot();
        }
      }
    } catch (err: any) {
      sendLog(`Keep-alive ping failed: ${err.message}`, 'error');
    }
  }, 30000); // Every 30 seconds

  sendLog('Keep-alive mode active — server will stay running 24/7');
  sendLog('Bot will periodically ping the server to prevent auto-shutdown');
  mainWindow?.webContents.send('bot:status', { active: true, serverId: config.serverId });
}

// Stop the keep-alive bot
export function stopBot(): { success: boolean } {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  if (bot) {
    try {
      bot.quit();
    } catch {}
    bot = null;
  }

  currentConfig = null;
  currentMainWindow = null;

  return { success: true };
}

// Check if bot is running
export function isBotActive(): boolean {
  if (bot) return !bot._client?.ended;
  return keepAliveInterval !== null;
}
