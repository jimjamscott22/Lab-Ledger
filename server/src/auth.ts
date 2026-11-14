import { createHash, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE = 'lab_ledger_token';
const MAX_TOKEN_LENGTH = 500;

export function tokensMatch(presented: string, expected: string): boolean {
  if (presented.length === 0 || presented.length > MAX_TOKEN_LENGTH) return false;
  if (expected.length === 0 || expected.length > MAX_TOKEN_LENGTH) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export function cookieToken(header: string | undefined, name = AUTH_COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function authCookie(token: string): string {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict`;
}

export function presentedToken(
  authorization: string | undefined,
  cookie: string | undefined,
): string | null {
  return bearerToken(authorization) ?? cookieToken(cookie);
}
