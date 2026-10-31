import { EventEmitter } from 'node:events';
import type { LabEventPayload } from '@lab-ledger/shared';

export class LabEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(e: LabEventPayload): void {
    this.emitter.emit('event', e);
  }

  subscribe(fn: (e: LabEventPayload) => void): () => void {
    this.emitter.on('event', fn);
    return () => this.emitter.off('event', fn);
  }
}
