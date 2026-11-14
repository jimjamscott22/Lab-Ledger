import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { LabEventPayload } from '@lab-ledger/shared';

export class LabEvents {
  private readonly emitter = new EventEmitter();
  private readonly streams = new Set<ServerResponse>();

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

  track(res: ServerResponse): () => void {
    this.streams.add(res);
    return () => {
      this.streams.delete(res);
    };
  }

  // Fastify waits for hijacked SSE sockets during close. End them first.
  closeStreams(): void {
    for (const res of this.streams) {
      if (!res.writableEnded) res.end();
    }
    this.streams.clear();
  }
}
