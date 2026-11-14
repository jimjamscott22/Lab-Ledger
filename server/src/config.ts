import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

export interface Config {
  labsDir: string;
  dataDir: string;
  port: number;
  host: string;
  timezone: string;
  watchStabilityMs: number;
  /** Set only when the server is bound to a non-loopback address. */
  authToken: string | null;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

function requiredInt(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  const text = raw === undefined || raw.trim() === '' ? String(fallback) : raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`${name} must be an integer from ${min} to ${max} (got ${raw})`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max} (got ${raw})`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = (env.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const loopback = isLoopbackHost(host);
  const authToken = env.AUTH_TOKEN?.trim() ?? '';
  if (!loopback && authToken.length === 0) {
    throw new Error(
      `AUTH_TOKEN is required when HOST is ${host}. Set AUTH_TOKEN, or bind to 127.0.0.1.`,
    );
  }
  return {
    labsDir: env.LABS_DIR ? path.resolve(env.LABS_DIR) : path.join(repoRoot, 'labs'),
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    port: requiredInt(env.PORT, 4317, 'PORT', 1, 65535),
    host,
    timezone: 'America/New_York',
    watchStabilityMs: requiredInt(env.WATCH_STABILITY_MS, 2000, 'WATCH_STABILITY_MS', 0, 600_000),
    authToken: loopback ? null : authToken,
  };
}
