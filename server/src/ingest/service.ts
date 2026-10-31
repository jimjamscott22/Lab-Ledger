import type { Db } from '../db/open';
import { getLab } from '../db/repo';
import type { LabEvents } from '../events';
import { scanLabs, type ScanResult } from './scan';

export interface IngestService {
  rescan(): ScanResult;
}

export function createIngestService(o: { db: Db; labsDir: string; events: LabEvents }): IngestService {
  return {
    rescan() {
      const r = scanLabs(o.db, o.labsDir);
      const emit = (type: 'lab:added' | 'lab:updated' | 'lab:removed', slug: string) =>
        o.events.publish({ type, slug, title: getLab(o.db, slug)?.title });
      r.added.forEach((s) => emit('lab:added', s));
      r.updated.forEach((s) => emit('lab:updated', s));
      r.removed.forEach((s) => emit('lab:removed', s));
      return r;
    },
  };
}
