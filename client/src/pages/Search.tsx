import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SearchKind, SearchResult } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const DEBOUNCE_MS = 250;
const KIND_LABELS: Record<SearchKind, string> = { lab: 'Lab', journal: 'Journal', ticket: 'Ticket' };

const href = (r: SearchResult) => (r.kind === 'lab' ? `/labs/${r.slug}` : `/labs/${r.slug}?tab=${r.kind}`);
const heading = (r: SearchResult) =>
  `${r.labNumber ? `Lab ${String(r.labNumber).padStart(2, '0')}: ` : ''}${r.labTitle}`;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(params.get('q') ?? '');

  const commit = (value: string) => {
    if (value.trim() !== query) setParams(value.trim() ? { q: value.trim() } : {}, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => commit(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    setInput(params.get('q') ?? '');
  }, [params.get('q')]);

  useEffect(() => {
    document.getElementById('search-input')?.focus();
  }, []);

  const { data, error, loading } = useAsync<SearchResult[]>(
    () => (query ? api.search(query) : Promise.resolve([])),
    [query],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    commit(input);
  };

  let status = '';
  if (query && loading && !data) status = 'Searching…';
  else if (query && data) {
    status = data.length === 0 ? `No results for “${query}”` : `${data.length} result${data.length === 1 ? '' : 's'} for “${query}”`;
  }

  return (
    <>
      <h1>Search</h1>
      <form role="search" className="search-form" onSubmit={onSubmit}>
        <label htmlFor="search-input">Search labs, journal notes and tickets</label>
        <input
          id="search-input"
          type="search"
          value={input}
          maxLength={200}
          autoComplete="off"
          placeholder="Try “group policy” or “kerberos”"
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
      <p role="status" aria-live="polite" className="muted">
        {status}
      </p>
      {error ? <p role="alert">Search failed: {error.message}</p> : null}
      {data && data.length > 0 ? (
        <ul className="results">
          {data.map((r) => (
            <li key={`${r.slug}#${r.kind}`} className="card">
              <Link to={href(r)}>{heading(r)}</Link>
              <span className="chip">{KIND_LABELS[r.kind]}</span>
              <p className="snippet">
                {r.snippet.map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
