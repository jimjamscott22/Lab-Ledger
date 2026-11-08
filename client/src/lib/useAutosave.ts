import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveOptions<T> {
  value: T | null;
  save: (value: T) => Promise<unknown>;
  saveOnLeave: (value: T) => void;
  delayMs?: number;
}

/**
 * Shared autosave lifecycle for the journal and ticket editors.
 *
 * Saves run through a single promise chain, so a slow save can never land
 * after (and overwrite) a newer one. `dirty` is only cleared for the exact
 * snapshot that was sent; edits made while a save is in flight stay dirty
 * and are saved by a follow-up run. Leaving the page flushes the latest
 * snapshot through the keepalive path, but only when it is still unsaved.
 */
export function useAutosave<T>({ value, save, saveOnLeave, delayMs = 800 }: AutosaveOptions<T>) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const latest = useRef(value);
  latest.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveOnLeaveRef = useRef(saveOnLeave);
  saveOnLeaveRef.current = saveOnLeave;
  const dirty = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const enqueueSave = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (!dirty.current) return;
      const snapshot = latest.current;
      if (snapshot === null) return;
      dirty.current = false;
      setSaveState('saving');
      try {
        await saveRef.current(snapshot);
        if (latest.current === snapshot) {
          setSaveState('saved');
        } else {
          // Edited while saving; the debounce effect schedules the follow-up.
          dirty.current = true;
        }
      } catch {
        dirty.current = true;
        setSaveState('error');
      }
    });
    return chain.current;
  }, []);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setSaveState('idle');
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void enqueueSave(), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, enqueueSave]);

  useEffect(() => {
    const flushOnLeave = () => {
      if (!dirty.current || latest.current === null) return;
      dirty.current = false;
      saveOnLeaveRef.current(latest.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnLeave();
    };
    window.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      // Navigating away inside the SPA: persist through the normal,
      // serialized save path instead of a competing keepalive request.
      void enqueueSave();
    };
  }, [enqueueSave]);

  return { saveState, setSaveState, markDirty };
}
