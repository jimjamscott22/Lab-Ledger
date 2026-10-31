import { dayInTz, hhmmInTz } from './lib/time';

export function startScheduler(
  rescan: () => void,
  tz: string,
  now: () => Date = () => new Date(),
): () => void {
  const safe = () => {
    try {
      rescan();
    } catch (err) {
      console.error('scheduled rescan failed', err);
    }
  };
  const everyFifteen = setInterval(safe, 15 * 60_000);
  let lastDay = '';
  const tick = setInterval(() => {
    const d = now();
    const day = dayInTz(d, tz);
    if (hhmmInTz(d, tz) === '09:20' && lastDay !== day) {
      lastDay = day;
      safe();
    }
  }, 30_000);
  return () => {
    clearInterval(everyFifteen);
    clearInterval(tick);
  };
}
