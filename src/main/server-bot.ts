import { BrowserWindow } from 'electron';

let bot: any = null;
let botInterval: NodeJS.Timeout | null = null;

interface BotConfig {
  host: string;
  port: number;
  username: string;
  version: string;
  serverId: string;
}

// Start the keep-alive bot
export async function startBot(config: BotConfig, mainWindow: BrowserWindow | null): Promise<{ success: boolean }> {
  if (bot) {
    stopBot();
  }

  try {
    // Dynamic import for mineflayer (CommonJS)
    const mineflayer = (await import('mineflayer' as any)).default;

    const sendLog = (msg: string) => {
      mainWindow?.webContents.send('server:console', config.serverId, {
        timestamp: new Date().toISOString(),
        message: `[BOT] ${msg}`,
        level: 'info',
      });
    };

    sendLog(`Starting keep-alive bot on ${config.host}:${config.port}...`);

    bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username || 'ServerBot',
      version: config.version || false,
      hideErrors: true,
    });

    bot.on('spawn', () => {
      sendLog('Bot joined the server! Server will stay alive.');
      mainWindow?.webContents.send('bot:status', { active: true, serverId: config.serverId });
    });

    bot.on('error', (err: any) => {
      sendLog(`Bot error: ${err.message}`);
    });

    bot.on('kicked', (reason: any) => {
      sendLog(`Bot kicked: ${reason}`);
      // Auto-reconnect after 30 seconds
      if (botInterval) clearInterval(botInterval);
      botInterval = setInterval(() => {
        sendLog('Attempting to reconnect...');
        startBot(config, mainWindow);
      }, 30000);
    });

    bot.on('end', () => {
      sendLog('Bot disconnected');
      mainWindow?.webContents.send('bot:status', { active: false, serverId: config.serverId });
    });

    // Keep alive: move slightly every 5 minutes to prevent AFK kick
    botInterval = setInterval(() => {
      if (bot && bot.entity) {
        bot.setControlState('forward', true);
        setTimeout(() => {
          if (bot) bot.setControlState('forward', false);
        }, 100);
      }
    }, 300000); // 5 minutes

    return { success: true };
  } catch (err: any) {
    const sendLog = (msg: string) => {
      mainWindow?.webContents.send('server:console', config.serverId, {
        timestamp: new Date().toISOString(),
        message: `[BOT] ${msg}`,
        level: 'error',
      });
    };
    sendLog(`Failed to start bot: ${err.message}`);
    return { success: false };
  }
}

// Stop the keep-alive bot
export function stopBot(): { success: boolean } {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }

  if (bot) {
    try {
      bot.quit();
    } catch {}
    bot = null;
  }

  return { success: true };
}

// Check if bot is running
export function isBotActive(): boolean {
  return bot !== null && !bot._client?.ended;
}
