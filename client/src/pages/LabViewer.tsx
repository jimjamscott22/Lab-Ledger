import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { JournalEditor } from '../components/JournalEditor';
import { LabFrame } from '../components/LabFrame';
import { SectionReader } from '../components/SectionReader';
import { StepList } from '../components/StepList';
import { TicketEditor } from '../components/TicketEditor';
import { api } from '../lib/api';
import { isTyping, useHotkeys } from '../lib/hotkeys';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

const NOTE_TABS = ['steps', 'journal', 'ticket'] as const;
type NoteTab = (typeof NOTE_TABS)[number];

function nextNoteTab(current: NoteTab, key: string): NoteTab | null {
  const index = NOTE_TABS.indexOf(current);
  if (key === 'Home') return NOTE_TABS[0];
  if (key === 'End') return NOTE_TABS[NOTE_TABS.length - 1];
  if (key === 'ArrowRight') return NOTE_TABS[(index + 1) % NOTE_TABS.length];
  if (key === 'ArrowLeft') return NOTE_TABS[(index - 1 + NOTE_TABS.length) % NOTE_TABS.length];
  return null;
}

export default function LabViewer() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { data, error } = useAsync(() => api.lab(slug), [slug]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<LabStatus>('not_started');
  const [focusStep, setFocusStep] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const reading = searchParams.get('view') === 'sections';
  const labHref = (target: string) => `/labs/${target}${reading ? '?view=sections' : ''}`;
  const setReading = (value: boolean) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('view', 'sections');
      else next.delete('view');
      return next;
    });
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<NoteTab>(
    requestedTab === 'journal' || requestedTab === 'ticket' ? requestedTab : 'steps',
  );
  const selectNoteTab = (next: NoteTab) => {
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  const [allChecked, setAllChecked] = useState(false);
  const [saveError, setSaveError] = useState('');
  const journalRef = useRef<HTMLTextAreaElement>(null);
  const mutationChain = useRef<Promise<void>>(Promise.resolve());
  // Last state the server actually confirmed. Failed mutations roll back
  // to this — never to "undo my own click", which composes wrongly when
  // several optimistic changes are queued and more than one fails.
  const confirmedChecked = useRef<Set<number>>(new Set());
  const confirmedStatus = useRef<LabStatus>('not_started');

  // Serialize step/status mutations so rapid clicks reach the server in
  // click order, and roll the optimistic UI back when a mutation fails.
  const enqueueMutation = (run: () => Promise<void>) => {
    mutationChain.current = mutationChain.current.then(run, run);
    return mutationChain.current;
  };

  useEffect(() => {
    if (!data) return;
    confirmedChecked.current = new Set(data.checked);
    confirmedStatus.current = data.state.status;
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
    await enqueueMutation(async () => {
      try {
        const res = await api.toggleStep(slug, index, value);
        confirmedChecked.current = new Set(res.checked);
        confirmedStatus.current = res.status;
        setChecked(new Set(res.checked));
        setStatus(res.status);
        setAllChecked(res.allChecked && res.status !== 'completed');
        setSaveError('');
      } catch {
        setChecked(new Set(confirmedChecked.current));
        setStatus(confirmedStatus.current);
        setAllChecked(
          total > 0 &&
            confirmedChecked.current.size === total &&
            confirmedStatus.current !== 'completed',
        );
        setSaveError('Could not save that step change. It has been undone.');
      }
    });
  }

  async function changeStatus(next: LabStatus) {
    setStatus(next);
    await enqueueMutation(async () => {
      try {
        const state = await api.setStatus(slug, next);
        confirmedStatus.current = state.status;
        setStatus(state.status);
        if (next === 'completed') setAllChecked(false);
        setSaveError('');
      } catch {
        setStatus(confirmedStatus.current);
        setSaveError('Could not save that status change. It has been undone.');
      }
    });
  }

  const onKey = useHotkeys((e) => {
    if (e.defaultPrevented || !data || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey)
      return;
    const target = e.target as HTMLElement | null;
    switch (e.key) {
      case 'ArrowLeft':
        if (data.neighbors.prev) nav(labHref(data.neighbors.prev));
        break;
      case 'ArrowRight':
        if (data.neighbors.next) nav(labHref(data.neighbors.next));
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
          <Link to={labHref(neighbors.prev)} role="button" aria-label="Previous lab">
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
          <Link to={labHref(neighbors.next)} role="button" aria-label="Next lab">
            →
          </Link>
        ) : (
          <button type="button" disabled aria-label="Next lab">
            →
          </button>
        )}
      </div>

      {saveError ? (
        <div className="banner" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}

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
        <section className="lab-content" aria-label="Lab content">
          <div
            className="tabs"
            role="tablist"
            aria-label="Lab view"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? false : event.key === 'End' ? true : !reading;
              setReading(next);
              document.getElementById(next ? 'view-sections' : 'view-original')?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              id="view-original"
              aria-selected={!reading}
              aria-controls="view-panel-original"
              tabIndex={reading ? -1 : 0}
              onClick={() => setReading(false)}
            >
              Original
            </button>
            <button
              type="button"
              role="tab"
              id="view-sections"
              aria-selected={reading}
              aria-controls="view-panel-sections"
              tabIndex={reading ? 0 : -1}
              onClick={() => setReading(true)}
            >
              Sections
            </button>
          </div>
          <div
            className="lab-source-panel"
            role="tabpanel"
            id="view-panel-original"
            aria-labelledby="view-original"
            hidden={reading}
          >
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
          </div>
          <div
            className="lab-reading-panel"
            role="tabpanel"
            id="view-panel-sections"
            aria-labelledby="view-sections"
            hidden={!reading}
            tabIndex={0}
          >
            {reading ? <SectionReader key={slug} sections={lab.sections} slug={slug} /> : null}
          </div>
        </section>
        <section className="panel" aria-label="Lab notes and steps">
          <div
            className="tabs"
            role="tablist"
            aria-label="Lab notes"
            onKeyDown={(event) => {
              const next = nextNoteTab(tab, event.key);
              if (!next) return;
              event.preventDefault();
              selectNoteTab(next);
            }}
          >
            {NOTE_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
              >
                {id === 'steps' ? 'Steps' : id === 'journal' ? 'Journal' : 'Ticket'}
              </button>
            ))}
          </div>
          <div
            className="panel-body"
            role="tabpanel"
            id="panel-steps"
            aria-labelledby="tab-steps"
            hidden={tab !== 'steps'}
          >
            <StepList
              steps={lab.steps}
              checked={checked}
              focusIndex={focusStep}
              onToggle={(i, v) => void toggle(i, v)}
            />
          </div>
          <div
            className="panel-body"
            role="tabpanel"
            id="panel-journal"
            aria-labelledby="tab-journal"
            hidden={tab !== 'journal'}
          >
            <JournalEditor key={slug} slug={slug} initial={data.journal} textareaRef={journalRef} />
          </div>
          <div
            className="panel-body"
            role="tabpanel"
            id="panel-ticket"
            aria-labelledby="tab-ticket"
            hidden={tab !== 'ticket'}
          >
            <TicketEditor key={slug} slug={slug} />
          </div>
        </section>
      </div>
    </>
  );
}
