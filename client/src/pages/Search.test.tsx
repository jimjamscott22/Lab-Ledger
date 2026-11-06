// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '@lab-ledger/shared';
import Search from './Search';
import { api } from '../lib/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const results: SearchResult[] = [
  {
    slug: 'windows-wont-wake-from-sleep',
    kind: 'lab',
    labTitle: "PC Won't Wake From Sleep",
    labNumber: 7,
    date: '2026-10-29',
    snippet: [
      { text: 'Steps to ', match: false },
      { text: 'wake', match: true },
      { text: ' a stuck PC', match: false },
    ],
  },
  {
    slug: 'gpo-drive-mapping',
    kind: 'journal',
    labTitle: 'GPO Drive Mapping',
    labNumber: 2,
    date: '2026-10-24',
    snippet: [{ text: '<img src=x onerror=alert(1)> note', match: false }],
  },
  {
    slug: 'gpo-drive-mapping',
    kind: 'ticket',
    labTitle: 'GPO Drive Mapping',
    labNumber: 2,
    date: '2026-10-24',
    snippet: [{ text: 'ticket text', match: false }],
  },
];

describe('Search page', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (entry: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Search />
        </MemoryRouter>,
      );
    });
  };
  const typeInto = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('searches for the query in the URL and shows highlighted, linked results', async () => {
    const spy = vi.spyOn(api, 'search').mockResolvedValue(results);
    await render('/search?q=wake');

    expect(spy).toHaveBeenCalledWith('wake');
    expect(container.querySelector('h1')?.textContent).toBe('Search');
    expect((container.querySelector('#search-input') as HTMLInputElement).value).toBe('wake');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('3 results for “wake”');

    const marks = Array.from(container.querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['wake']);

    const links = Array.from(container.querySelectorAll('li a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/labs/windows-wont-wake-from-sleep',
      '/labs/gpo-drive-mapping?tab=journal',
      '/labs/gpo-drive-mapping?tab=ticket',
    ]);
    expect(container.querySelector('li a')?.textContent).toBe("Lab 07: PC Won't Wake From Sleep");
    const kinds = Array.from(container.querySelectorAll('li .chip')).map((c) => c.textContent);
    expect(kinds).toEqual(['Lab', 'Journal', 'Ticket']);
  });

  it('renders snippet text as text, never as markup', async () => {
    vi.spyOn(api, 'search').mockResolvedValue(results);
    await render('/search?q=img');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)> note');
  });

  it('says so when nothing matches', async () => {
    vi.spyOn(api, 'search').mockResolvedValue([]);
    await render('/search?q=zzz');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('No results for “zzz”');
  });

  it('does not call the API until there is a query', async () => {
    const spy = vi.spyOn(api, 'search').mockResolvedValue(results);
    await render('/search');
    expect(spy).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('searches shortly after typing stops', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'search').mockResolvedValue(results);
    await render('/search');
    const input = container.querySelector('#search-input') as HTMLInputElement;

    await typeInto(input, 'ke');
    await typeInto(input, 'kerberos');
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('kerberos');
  });

  it('searches immediately when the form is submitted', async () => {
    const spy = vi.spyOn(api, 'search').mockResolvedValue(results);
    await render('/search');
    await typeInto(container.querySelector('#search-input') as HTMLInputElement, 'dns');
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(spy).toHaveBeenCalledWith('dns');
  });

  it('reports a failed search', async () => {
    vi.spyOn(api, 'search').mockRejectedValue(new Error('500 boom'));
    await render('/search?q=wake');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Search failed');
  });
});
