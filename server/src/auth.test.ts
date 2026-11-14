import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { tokensMatch } from './auth';
import { makeTestApp } from './testing-app';

const TOKEN = 'lab-secret-token';

describe('shared token', () => {
  it('compares tokens without treating a different length as a match', () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch('nope', TOKEN)).toBe(false);
    expect(tokensMatch('', TOKEN)).toBe(false);
    expect(tokensMatch(`${TOKEN} `, TOKEN)).toBe(false);
  });

  it('leaves loopback servers open and blocks other binds until the token is presented', async () => {
    const open = await makeTestApp();
    expect((await open.app.inject('/api/auth')).json()).toEqual({
      required: false,
      authenticated: true,
    });
    expect((await open.app.inject('/api/labs')).statusCode).toBe(200);

    const { app, ctx } = await makeTestApp({ host: '0.0.0.0', authToken: TOKEN });
    expect((await app.inject('/api/labs')).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/restore', payload: {} })).statusCode,
    ).toBe(401);
    expect((await app.inject('/api/events')).statusCode).toBe(401);
    expect((await app.inject('/api/auth')).json()).toEqual({
      required: true,
      authenticated: false,
    });
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth', payload: { token: 'wrong-token' } }))
        .statusCode,
    ).toBe(401);

    const login = await app.inject({ method: 'POST', url: '/api/auth', payload: { token: TOKEN } });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0];
    expect(setCookie).toContain('HttpOnly');
    expect((await app.inject({ url: '/api/labs', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth', headers: { cookie } })).json()).toMatchObject({
      authenticated: true,
    });
    expect(
      (await app.inject({ url: '/api/labs', headers: { authorization: `Bearer ${TOKEN}` } }))
        .statusCode,
    ).toBe(200);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Lab</title>');
    const shell = await buildApp(ctx, { clientDir: dir });
    const page = await shell.inject('/');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Lab');
    expect((await shell.inject('/api/labs')).statusCode).toBe(401);
    await shell.close();
    await app.close();
    await open.app.close();
  });
});
