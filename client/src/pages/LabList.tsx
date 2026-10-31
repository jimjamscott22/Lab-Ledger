import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { useLabEvents } from '../lib/events';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };

export default function LabList() {
  const { data, error, reload } = useAsync(() => api.labs(), []);
  useLabEvents(() => reload());
  const [filter, setFilter] = useState<LabStatus | 'all'>('all');

  if (error) return <p role="alert">Could not load labs: {error.message}</p>;
  if (!data) return <p>Loading…</p>;

  const labs = [...data].reverse().filter((l) => filter === 'all' || l.status === filter);

  return (
    <>
      <h1>Labs</h1>
      <label>
        Status{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as LabStatus | 'all')}>
          <option value="all">All</option>
          {LAB_STATUSES.map((s) => (
            <option key={s} value={s}>{LABELS[s]}</option>
          ))}
        </select>
      </label>
      <ul className="lab-list">
        {labs.map((l) => (
          <li key={l.slug} className="lab-card">
            <span>
              <Link to={`/labs/${l.slug}`}>
                <span className="num">{l.labNumber ? `Lab ${String(l.labNumber).padStart(2, '0')}` : 'Lab'}</span>
                <span className="title">{l.title}</span>
              </Link>
              {l.parseStatus !== 'ok' && !l.missingFile ? <span className="chip warn">parsed partially</span> : null}
              {l.missingFile ? <span className="chip warn">file missing</span> : null}
            </span>
            <span>
              <span className="label">{l.date}</span>
              <span className={`chip ${l.status}`}>{LABELS[l.status]}</span>
              <span className="label"> {l.stepsChecked}/{l.stepsTotal}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
