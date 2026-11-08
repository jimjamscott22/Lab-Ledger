import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { useLabEvents } from '../lib/events';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};
const FILTER_KEYS = ['status', 'topic', 'tag', 'from', 'to', 'notes', 'q'];

function TextFilter({
  query,
  filterKey,
  commit,
}: {
  query: string;
  filterKey: string;
  commit: (value: string) => void;
}) {
  const [input, setInput] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    setInput(query);
    return () => clearTimeout(timer.current);
  }, [query, filterKey]);
  return (
    <label className="lab-text-filter">
      Search labs, notes and tickets
      <input
        type="search"
        maxLength={200}
        value={input}
        onChange={(event) => {
          const value = event.target.value;
          setInput(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(value.trim()), 250);
        }}
      />
    </label>
  );
}

export default function LabList() {
  const [params, setParams] = useSearchParams();
  const [resetVersion, setResetVersion] = useState(0);
  const filters = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters.set(key, value);
  }
  const filterKey = filters.toString();
  const { data: all, error: allError, reload: reloadAll } = useAsync(() => api.labs(), []);
  const { data, error, loading, reload } = useAsync(() => api.labs(filters), [filterKey]);
  useLabEvents(() => {
    reloadAll();
    reload();
  });
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const topics = [...new Set(all?.flatMap((lab) => lab.topics) ?? [])].sort();
  const tags = [...new Set(all?.flatMap((lab) => lab.tags) ?? [])].sort();
  const labs = [...(data ?? [])].reverse();

  return (
    <>
      <h1>Labs</h1>
      <div className="lab-filters" role="search" aria-label="Filter labs">
        <TextFilter
          filterKey={`${params}:${resetVersion}`}
          query={params.get('q') ?? ''}
          commit={(value) => update('q', value)}
        />
        <label>
          Status{' '}
          <select
            value={params.get('status') ?? ''}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {LAB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic{' '}
          <select
            value={params.get('topic') ?? ''}
            onChange={(e) => update('topic', e.target.value)}
          >
            <option value="">All topics</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tag{' '}
          <select value={params.get('tag') ?? ''} onChange={(e) => update('tag', e.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label>
          From date{' '}
          <input
            type="date"
            value={params.get('from') ?? ''}
            onChange={(e) => update('from', e.target.value)}
          />
        </label>
        <label>
          To date{' '}
          <input
            type="date"
            value={params.get('to') ?? ''}
            onChange={(e) => update('to', e.target.value)}
          />
        </label>
        <label>
          Notes{' '}
          <select
            value={params.get('notes') ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          >
            <option value="">With or without notes</option>
            <option value="yes">Has notes</option>
            <option value="no">No notes</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setResetVersion((version) => version + 1);
            setParams({});
          }}
        >
          Reset filters
        </button>
      </div>
      {error || allError ? (
        <p role="alert">Could not load labs: {(error ?? allError)?.message}</p>
      ) : null}
      <p role="status">
        {loading
          ? 'Loading labs…'
          : data
            ? `${labs.length} of ${all?.length ?? labs.length} labs`
            : ''}
      </p>
      {!loading && data?.length === 0 ? (
        <p>No labs match these filters. Try changing or resetting them.</p>
      ) : null}
      <ul className="lab-list">
        {labs.map((l) => (
          <li key={l.slug} className="lab-card">
            <span>
              <Link to={`/labs/${l.slug}`}>
                <span className="num">
                  {l.labNumber ? `Lab ${String(l.labNumber).padStart(2, '0')}` : 'Lab'}
                </span>
                <span className="title">{l.title}</span>
              </Link>
              <span className="lab-tags" aria-label="Tags">
                {l.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
              {l.parseStatus !== 'ok' && !l.missingFile ? (
                <span className="chip warn">parsed partially</span>
              ) : null}
              {l.missingFile ? <span className="chip warn">file missing</span> : null}
            </span>
            <span>
              <span className="label">{l.date}</span>
              <span className={`chip ${l.status}`}>{LABELS[l.status]}</span>
              <span className="label">
                {' '}
                {l.stepsChecked}/{l.stepsTotal}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
