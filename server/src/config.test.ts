import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    const c = loadConfig({});
    expect(c.labsDir).toBe('/workspace/labs');
    expect(c.dataDir).toBe(path.resolve('./data'));
    expect(c.port).toBe(4317);
    expect(c.host).toBe('127.0.0.1');
    expect(c.timezone).toBe('America/New_York');
    expect(c.watchStabilityMs).toBe(2000);
  });

  it('reads overrides from the environment', () => {
    const c = loadConfig({ LABS_DIR: '/tmp/l', DATA_DIR: '/tmp/d', PORT: '9000', HOST: '0.0.0.0', WATCH_STABILITY_MS: '50' });
    expect(c).toMatchObject({ labsDir: '/tmp/l', dataDir: '/tmp/d', port: 9000, host: '0.0.0.0', watchStabilityMs: 50 });
  });
});
