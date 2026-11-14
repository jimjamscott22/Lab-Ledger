export interface ShutdownDeps {
  stopScheduler: () => void;
  closeWatcher: () => Promise<void>;
  closeApp: () => Promise<void>;
  closeDb: () => void;
  exit: (code: number) => void;
  logError?: (err: unknown) => void;
}

// Drain HTTP before closing SQLite, and ignore a second signal so the
// database is not closed twice.
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let running: Promise<void> | null = null;
  return () => {
    if (running) return running;
    running = run(deps);
    return running;
  };
}

async function run(deps: ShutdownDeps): Promise<void> {
  const log = deps.logError ?? ((err: unknown) => console.error(err));
  let failed = false;
  const step = async (fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      failed = true;
      log(err);
    }
  };
  await step(deps.stopScheduler);
  await step(deps.closeWatcher);
  await step(deps.closeApp);
  await step(deps.closeDb);
  deps.exit(failed ? 1 : 0);
}
