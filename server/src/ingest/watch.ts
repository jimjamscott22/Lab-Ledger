import path from 'node:path';
import chokidar from 'chokidar';
import { LAB_FILE_RE } from './parse';

export function watchLabs(o: {
  labsDir: string;
  stabilityMs: number;
  debounceMs?: number;
  onChange: () => void;
}): { ready: Promise<void>; close(): Promise<void> } {
  const watcher = chokidar.watch(o.labsDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: o.stabilityMs, pollInterval: 100 },
  });

  let timer: NodeJS.Timeout | null = null;
  const trigger = (file: string) => {
    const base = path.basename(file);
    if (!LAB_FILE_RE.test(base) && base !== 'lab-log.txt') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        o.onChange();
      } catch (err) {
        console.error('rescan failed', err);
      }
    }, o.debounceMs ?? 300);
  };
  watcher.on('add', trigger).on('change', trigger).on('unlink', trigger);

  const ready = new Promise<void>((resolve) => watcher.once('ready', () => resolve()));
  return {
    ready,
    close: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
