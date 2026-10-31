import { describe, it, expect } from 'vitest';
import { dayInTz, hhmmInTz } from './time';

describe('time helpers', () => {
  it('computes the New York day across the UTC boundary', () => {
    expect(dayInTz(new Date('2026-10-30T02:00:00Z'), 'America/New_York')).toBe('2026-10-29');
    expect(dayInTz(new Date('2026-10-30T05:00:00Z'), 'America/New_York')).toBe('2026-10-30');
  });
  it('formats 24h time in the zone', () => {
    expect(hhmmInTz(new Date('2026-10-29T13:20:00Z'), 'America/New_York')).toBe('09:20');
    expect(hhmmInTz(new Date('2026-10-29T04:05:00Z'), 'America/New_York')).toBe('00:05');
  });
});
