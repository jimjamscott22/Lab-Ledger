import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing-app';

describe('event streams', () => {
  it('ends an open stream so HTTP shutdown can finish', async () => {
    const { app, ctx } = await makeTestApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/events`);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    const started = Date.now();
    ctx.events.closeStreams();
    await app.close();
    expect(Date.now() - started).toBeLessThan(2000);
    const rest = await reader.read();
    expect(rest.done).toBe(true);
  });
});
