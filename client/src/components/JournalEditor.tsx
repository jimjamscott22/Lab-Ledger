import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react';
import type { Journal } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';

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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const latest = useRef(fields);
  const dirty = useRef(false);
  latest.current = fields;

  const save = async () => {
    dirty.current = false;
    setSaveState('saving');
    try {
      await api.saveJournal(slug, latest.current);
      setSaveState('saved');
    } catch {
      dirty.current = true;
      setSaveState('error');
    }
  };

  const change = (patch: Partial<Fields>) => {
    dirty.current = true;
    setSaveState('idle');
    setFields((f) => ({ ...f, ...patch }));
  };

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [fields]);

  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
      api.saveJournalOnLeave(slug, latest.current);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [slug]);

  const insert = (text: string) => {
    const ta = textareaRef.current;
    const body = latest.current.bodyMd;
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
