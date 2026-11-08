import { useMemo, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react';
import type { Journal } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import { useAutosave } from '../lib/useAutosave';

const TEMPLATE = '## What I did\n\n## What broke\n\n## How I fixed it\n\n## Commands that worked\n\n';

interface Props {
  slug: string;
  initial: Journal | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

type Fields = { bodyMd: string; timeTakenMin: number | null; difficulty: number | null; confidence: number | null };
const toNum = (v: string): number | null => (v === '' ? null : Number(v));

export function JournalEditor({ slug, initial, textareaRef }: Props) {
  const [fields, setFields] = useState<Fields>({
    bodyMd: initial && initial.bodyMd ? initial.bodyMd : TEMPLATE,
    timeTakenMin: initial?.timeTakenMin ?? null,
    difficulty: initial?.difficulty ?? null,
    confidence: initial?.confidence ?? null,
  });
  const { saveState, setSaveState, markDirty } = useAutosave({
    value: fields,
    save: (value) => api.saveJournal(slug, value),
    saveOnLeave: (value) => api.saveJournalOnLeave(slug, value),
  });

  const change = (patch: Partial<Fields>) => {
    markDirty();
    setFields((f) => ({ ...f, ...patch }));
  };

  const insert = (text: string) => {
    const ta = textareaRef.current;
    const body = fields.bodyMd;
    const start = ta?.selectionStart ?? body.length;
    const end = ta?.selectionEnd ?? body.length;
    change({ bodyMd: `${body.slice(0, start)}${text}${body.slice(end)}` });
  };

  const upload = async (file: File) => {
    try {
      const { url } = await api.uploadAttachment(slug, file);
      insert(`\n![screenshot](${url})\n`);
    } catch {
      setSaveState('error');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void upload(file);
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void upload(file);
  };

  const preview = useMemo(() => renderMarkdown(fields.bodyMd), [fields.bodyMd]);

  return (
    <div className="journal">
      <div className="journal-fields">
        <label>
          Time taken (min)
          <input type="number" min={0} value={fields.timeTakenMin ?? ''} onChange={(e) => change({ timeTakenMin: toNum(e.target.value) })} />
        </label>
        <label>
          Difficulty (1-5)
          <input type="number" min={1} max={5} value={fields.difficulty ?? ''} onChange={(e) => change({ difficulty: toNum(e.target.value) })} />
        </label>
        <label>
          Confidence (1-5)
          <input type="number" min={1} max={5} value={fields.confidence ?? ''} onChange={(e) => change({ confidence: toNum(e.target.value) })} />
        </label>
      </div>
      <label>
        <span className="sr-only">Journal (Markdown)</span>
        <textarea
          ref={textareaRef}
          aria-label="Journal (Markdown)"
          value={fields.bodyMd}
          onChange={(e) => change({ bodyMd: e.target.value })}
          onPaste={onPaste}
          onDrop={onDrop}
          placeholder="Paste or drop a screenshot to attach it."
        />
      </label>
      <p role="status" aria-live="polite">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed, will retry on next edit' : ''}
      </p>
      <h3>Preview</h3>
      <div className="journal-preview" dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  );
}
