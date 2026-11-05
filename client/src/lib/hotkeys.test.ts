import { describe, it, expect } from 'vitest';
import { isSearchShortcut, isTyping } from './hotkeys';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;

describe('isTyping', () => {
  it('is true for text-like fields', () => {
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    expect(isTyping(el('SELECT'))).toBe(true);
    expect(isTyping(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTyping(el('DIV', { isContentEditable: true }))).toBe(true);
  });
  it('is false for checkboxes, buttons and null', () => {
    expect(isTyping(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

const key = (init: Partial<KeyboardEvent>) => ({ key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent;

describe('isSearchShortcut', () => {
  it('accepts Ctrl+K and Cmd+K in either case', () => {
    expect(isSearchShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: true, key: 'K' }))).toBe(true);
  });
  it('rejects a bare k, other keys and other modifier combinations', () => {
    expect(isSearchShortcut(key({}))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, key: 'j' }))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
