import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from './shutdown';

describe('createShutdown', () => {
  it('closes the HTTP server before the database and ignores a second signal', async () => {
    const order: string[] = [];
    let releaseApp: () => void = () => {};
    const exit = vi.fn();
    const shutdown = createShutdown({
      stopScheduler: () => order.push('scheduler'),
      closeWatcher: async () => {
        order.push('watcher');
      },
      closeStreams: () => order.push('streams'),
      closeApp: () =>
        new Promise<void>((resolve) => {
          order.push('app');
          releaseApp = () => {
            order.push('app-done');
            resolve();
          };
        }),
      closeDb: () => order.push('db'),
      exit,
    });

    const first = shutdown();
    const second = shutdown();
    expect(second).toBe(first);
    for (let i = 0; i < 20 && !order.includes('app'); i++) await Promise.resolve();
    expect(order).toEqual(['scheduler', 'watcher', 'streams', 'app']);
    expect(exit).not.toHaveBeenCalled();

    releaseApp();
    await first;
    expect(order).toEqual(['scheduler', 'watcher', 'streams', 'app', 'app-done', 'db']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('still closes the database and exits non-zero when draining HTTP fails', async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({
      stopScheduler: () => order.push('scheduler'),
      closeWatcher: async () => {
        order.push('watcher');
      },
      closeStreams: () => order.push('streams'),
      closeApp: async () => {
        order.push('app');
        throw new Error('close failed');
      },
      closeDb: () => order.push('db'),
      exit,
      logError: () => {},
    });

    await shutdown();
    expect(order).toEqual(['scheduler', 'watcher', 'streams', 'app', 'db']);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
