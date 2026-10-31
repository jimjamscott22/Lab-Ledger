import { createHash } from 'node:crypto';

export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex');
export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
