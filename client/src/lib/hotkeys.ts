import { useCallback, useEffect, useRef } from 'react';

export function isTyping(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { type?: string }) | null;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') return el.type !== 'checkbox';
  return false;
}

export function isHelpShortcut(e: KeyboardEvent): boolean {
  return e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
}

export function isSearchShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
}

export function useHotkeys(handler: (e: KeyboardEvent) => void): (e: KeyboardEvent) => void {
  const ref = useRef(handler);
  ref.current = handler;
  const stable = useCallback((e: KeyboardEvent) => {
    if (document.querySelector('dialog[open]')) {
      if (isSearchShortcut(e)) e.preventDefault();
      return;
    }
    ref.current(e);
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', stable);
    return () => window.removeEventListener('keydown', stable);
  }, [stable]);
  return stable;
}
