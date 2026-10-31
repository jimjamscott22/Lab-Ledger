import { useEffect, useRef } from 'react';
import type { LabEventPayload } from '@lab-ledger/shared';

type Handler = (e: LabEventPayload) => void;
const handlers = new Set<Handler>();
let source: EventSource | null = null;

function subscribe(h: Handler): () => void {
  handlers.add(h);
  if (!source) {
    source = new EventSource('/api/events');
    for (const type of ['lab:added', 'lab:updated', 'lab:removed']) {
      source.addEventListener(type, (ev) => {
        const payload = JSON.parse((ev as MessageEvent<string>).data) as LabEventPayload;
        handlers.forEach((fn) => fn(payload));
      });
    }
  }
  return () => {
    handlers.delete(h);
  };
}

export function useLabEvents(handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), []);
}
