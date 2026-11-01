import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

export interface Config {
  labsDir: string;
  dataDir: string;
  port: number;
  host: string;
  timezone: string;
  watchStabilityMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    labsDir: env.LABS_DIR ? path.resolve(env.LABS_DIR) : path.join(repoRoot, 'labs'),
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    port: Number(env.PORT ?? 4317),
    host: env.HOST ?? '127.0.0.1',
    timezone: 'America/New_York',
    watchStabilityMs: Number(env.WATCH_STABILITY_MS ?? 2000),
  };
}
