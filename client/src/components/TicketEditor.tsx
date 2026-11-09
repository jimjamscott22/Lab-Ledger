import { useEffect, useState } from 'react';
import type { TicketFields } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { useAutosave } from '../lib/useAutosave';

const FIELD_LABELS: { key: keyof TicketFields; label: string; multiline?: boolean }[] = [
  { key: 'ticketNumber', label: 'Ticket #' },
  { key: 'requester', label: 'Requester' },
  { key: 'issue', label: 'Issue', multiline: true },
  { key: 'impact', label: 'Impact', multiline: true },
  { key: 'troubleshootingSteps', label: 'Troubleshooting steps', multiline: true },
  { key: 'rootCause', label: 'Root cause', multiline: true },
  { key: 'resolution', label: 'Resolution', multiline: true },
  { key: 'timeToResolve', label: 'Time to resolve' },
  { key: 'followUp', label: 'Follow-up', multiline: true },
];

export function TicketEditor({ slug }: { slug: string }) {
  const [fields, setFields] = useState<TicketFields | null>(null);
  const [error, setError] = useState('');
  const { saveState, markDirty } = useAutosave({
    value: fields,
    save: (value) => api.saveTicket(slug, value),
    saveOnLeave: (value) => api.saveTicketOnLeave(slug, value),
  });

  useEffect(() => {
    let active = true;
    void api
      .ticket(slug)
      .then((ticket) => {
        if (active) setFields(ticket.fields);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load ticket');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) return <p role="alert">Could not load ticket: {error}</p>;
  if (!fields) return <p>Loading ticket…</p>;

  const change = (key: keyof TicketFields, value: string) => {
    markDirty();
    setFields((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="ticket-editor">
      <p className="ticket-actions">
        <a href={`/api/labs/${slug}/ticket/markdown`} download>
          Download Markdown
        </a>
      </p>
      {FIELD_LABELS.map(({ key, label, multiline }) => (
        <label key={key}>
          {label}
          {multiline ? (
            <textarea value={fields[key]} onChange={(event) => change(key, event.target.value)} />
          ) : (
            <input value={fields[key]} onChange={(event) => change(key, event.target.value)} />
          )}
        </label>
      ))}
      <p role="status" aria-live="polite">
        {saveState === 'saving'
          ? 'Saving…'
          : saveState === 'saved'
            ? 'Saved'
            : saveState === 'error'
              ? 'Save failed, will retry on next edit'
              : ''}
      </p>
    </div>
  );
}
