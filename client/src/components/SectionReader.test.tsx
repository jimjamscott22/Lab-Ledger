// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SectionReader } from './SectionReader';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SectionReader', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders all section kinds in order with distinct contents links for duplicate headings', async () => {
    await act(async () =>
      root.render(
        <SectionReader
          slug="demo"
          sections={[
            { kind: 'scenario', heading: 'Overview', html: '<p>Scenario</p>' },
            { kind: 'other', heading: 'Overview', html: '<pre>Extra information</pre>' },
            { kind: 'steps', heading: '', html: '<label><input type="checkbox">A step</label>' },
          ]}
        />,
      ),
    );
    const headings = [...container.querySelectorAll('section h2')];
    expect(headings.map((h) => h.textContent)).toEqual(['Overview', 'Overview', 'Section 3']);
    expect(new Set(headings.map((h) => h.id)).size).toBe(3);
    expect([...container.querySelectorAll('nav a')].map((a) => a.getAttribute('href'))).toEqual(
      headings.map((h) => `#${h.id}`),
    );
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('Use the Steps panel');
  });

  it('explains the original-source fallback when no sections were parsed', async () => {
    await act(async () => root.render(<SectionReader slug="empty" sections={[]} />));
    expect(container.textContent).toContain('No readable sections were found. Use Original');
    expect(container.querySelector('nav')).toBeNull();
  });
});
