export interface ServerConfig {
  id: string;
  name: string;
  path: string;
  version: string;
  modLoader: 'vanilla' | 'forge' | 'fabric' | 'paper' | 'spigot' | 'purpur';
  port: number;
  maxPlayers: number;
  ram: { min: string; max: string };
  motd: string;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  whitelist: boolean;
  onlineMode: boolean;
  pvp: boolean;
  spawnProtection: number;
  viewDistance: number;
  properties: Record<string, string>;
  jvmArgs: string[];
  createdAt: string;
}

export interface ServerStatus {
  running: boolean;
  pid: number | null;
  players: { name: string; uuid: string }[];
  maxPlayers: number;
  tps: number;
  uptime: number;
  memory: { used: number; max: number };
  cpu: number;
}

export interface ConsoleLine {
  timestamp: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export interface JavaInfo {
  path: string;
  version: string;
  is64Bit: boolean;
}

export interface ServerTemplate {
  name: string;
  version: string;
  modLoader: ServerConfig['modLoader'];
  description: string;
  downloadUrl?: string;
}

export type AppView = 'dashboard' | 'server' | 'settings' | 'create';
