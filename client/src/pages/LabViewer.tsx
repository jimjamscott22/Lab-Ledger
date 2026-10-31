import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { JournalEditor } from '../components/JournalEditor';
import { LabFrame } from '../components/LabFrame';
import { StepList } from '../components/StepList';
import { api } from '../lib/api';
import { isTyping, useHotkeys } from '../lib/hotkeys';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export default function LabViewer() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { data, error } = useAsync(() => api.lab(slug), [slug]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<LabStatus>('not_started');
  const [focusStep, setFocusStep] = useState(0);
  const [tab, setTab] = useState<'steps' | 'journal'>('steps');
  const [allChecked, setAllChecked] = useState(false);
  const journalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data) return;
    setChecked(new Set(data.checked));
    setStatus(data.state.status);
    setFocusStep(0);
    setAllChecked(false);
  }, [data]);

  const total = data?.lab.steps.length ?? 0;

  async function toggle(index: number, value: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
    const res = await api.toggleStep(slug, index, value);
    setStatus(res.status);
    setAllChecked(res.allChecked && res.status !== 'completed');
  }

  async function changeStatus(next: LabStatus) {
    setStatus(next);
    const state = await api.setStatus(slug, next);
    setStatus(state.status);
    if (next === 'completed') setAllChecked(false);
  }

  const onKey = useHotkeys((e) => {
    if (!data || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    switch (e.key) {
      case 'ArrowLeft':
        if (data.neighbors.prev) nav(`/labs/${data.neighbors.prev}`);
        break;
      case 'ArrowRight':
        if (data.neighbors.next) nav(`/labs/${data.neighbors.next}`);
        break;
      case 'j':
        setFocusStep((i) => Math.min(i + 1, Math.max(total - 1, 0)));
        break;
      case 'k':
        setFocusStep((i) => Math.max(i - 1, 0));
        break;
      case ' ':
        if (target?.tagName === 'INPUT' || target?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (total > 0) void toggle(focusStep, !checked.has(focusStep));
        break;
      case 's': {
        const next = LAB_STATUSES[(LAB_STATUSES.indexOf(status) + 1) % LAB_STATUSES.length];
        void changeStatus(next);
        break;
      }
      case 'n':
        e.preventDefault();
        setTab('journal');
        setTimeout(() => journalRef.current?.focus(), 0);
        break;
    }
  });

  if (error) return <p role="alert">Could not load lab: {error.message}</p>;
  if (!data) return <p>Loading…</p>;
  const { lab, neighbors } = data;
  const pct = total ? Math.round((checked.size / total) * 100) : 0;

  return (
    <>
      <div className="viewer-head">
        {neighbors.prev ? (
          <Link to={`/labs/${neighbors.prev}`} role="button" aria-label="Previous lab">
            ←
          </Link>
        ) : (
          <button type="button" disabled aria-label="Previous lab">
            ←
          </button>
        )}
        <h1>
          {lab.labNumber ? `Lab ${String(lab.labNumber).padStart(2, '0')}: ` : ''}
          {lab.title}
        </h1>
        {lab.parseStatus !== 'ok' && !lab.missingFile ? (
          <span className="chip warn">parsed partially</span>
        ) : null}
        <label>
          <span className="sr-only">Status</span>
          <select
            value={status}
            onChange={(e) => void changeStatus(e.target.value as LabStatus)}
            aria-label="Status"
          >
            {LAB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="progress">
          <div>
            {checked.size}/{total} steps
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label="Step progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={checked.size}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        {neighbors.next ? (
          <Link to={`/labs/${neighbors.next}`} role="button" aria-label="Next lab">
            →
          </Link>
        ) : (
          <button type="button" disabled aria-label="Next lab">
            →
          </button>
        )}
      </div>

      {allChecked ? (
        <div className="banner" role="status">
          <span>Every step is checked.</span>
          <button type="button" className="primary" onClick={() => void changeStatus('completed')}>
            Mark completed
          </button>
          <button type="button" onClick={() => setAllChecked(false)}>
            Not yet
          </button>
        </div>
      ) : null}

      <div className="viewer">
        {lab.missingFile ? (
          <p className="card">The lab file is missing from the labs folder.</p>
        ) : (
          <LabFrame
            slug={slug}
            title={lab.title}
            checked={checked}
            onToggle={(i, v) => void toggle(i, v)}
            onKey={onKey}
          />
        )}
        <section className="panel" aria-label="Lab notes and steps">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              id="tab-steps"
              aria-selected={tab === 'steps'}
              aria-controls="panel-steps"
              onClick={() => setTab('steps')}
            >
              Steps
            </button>
            <button
              type="button"
              role="tab"
              id="tab-journal"
              aria-selected={tab === 'journal'}
              aria-controls="panel-journal"
              onClick={() => setTab('journal')}
            >
              Journal
            </button>
          </div>
          <div
            className="panel-body"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            <div hidden={tab !== 'steps'}>
              <StepList
                steps={lab.steps}
                checked={checked}
                focusIndex={focusStep}
                onToggle={(i, v) => void toggle(i, v)}
              />
            </div>
            <div hidden={tab !== 'journal'}>
              <JournalEditor key={slug} slug={slug} initial={data.journal} textareaRef={journalRef} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
