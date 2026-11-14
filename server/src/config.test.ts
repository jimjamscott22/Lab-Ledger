import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    const c = loadConfig({});
    expect(c.labsDir).toBe(path.join(repoRoot, 'labs'));
    expect(c.dataDir).toBe(path.resolve('./data'));
    expect(c.port).toBe(4317);
    expect(c.host).toBe('127.0.0.1');
    expect(c.timezone).toBe('America/New_York');
    expect(c.watchStabilityMs).toBe(2000);
    expect(c.authToken).toBeNull();
  });

  it('resolves the default labsDir to the repository root regardless of process.cwd()', () => {
    const prevCwd = process.cwd();
    const serverDir = path.join(repoRoot, 'server');
    try {
      process.chdir(serverDir);
      const c = loadConfig({});
      expect(c.labsDir).toBe(path.join(repoRoot, 'labs'));
    } finally {
      process.chdir(prevCwd);
    }
  });

  it('reads overrides from the environment', () => {
    const c = loadConfig({
      LABS_DIR: '/tmp/l',
      DATA_DIR: '/tmp/d',
      PORT: '9000',
      HOST: '0.0.0.0',
      WATCH_STABILITY_MS: '50',
      AUTH_TOKEN: 'lab-secret-token',
    });
    expect(c).toMatchObject({
      labsDir: '/tmp/l',
      dataDir: '/tmp/d',
      port: 9000,
      host: '0.0.0.0',
      watchStabilityMs: 50,
      authToken: 'lab-secret-token',
    });
  });

  it('rejects ports and stability windows that are not integers in range', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '0' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '65536' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '4317.5' })).toThrow(/PORT/);
    expect(() => loadConfig({ WATCH_STABILITY_MS: 'nope' })).toThrow(/WATCH_STABILITY_MS/);
    expect(() => loadConfig({ WATCH_STABILITY_MS: '-1' })).toThrow(/WATCH_STABILITY_MS/);
  });

  it('requires a token only when the bind address is not loopback', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow(/AUTH_TOKEN/);
    expect(() => loadConfig({ HOST: '192.168.1.20', AUTH_TOKEN: '   ' })).toThrow(/AUTH_TOKEN/);
    expect(loadConfig({ HOST: 'localhost', AUTH_TOKEN: 'lab-secret-token' }).authToken).toBeNull();
    expect(loadConfig({ HOST: '::1' }).authToken).toBeNull();
  });
});
