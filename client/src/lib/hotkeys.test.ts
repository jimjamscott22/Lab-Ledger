import { describe, it, expect } from 'vitest';
import { isTyping } from './hotkeys';

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
