import { describe, it, expect } from 'vitest';
import {
  StatusBody,
  StepToggleBody,
  JournalBody,
  TicketBody,
  QuestionReviewBody,
  TOPICS,
  BackupSchema,
} from './index';

describe('shared schemas', () => {
  it('has the 12 rotation topics', () => {
    expect(TOPICS).toHaveLength(12);
  });
  it('accepts valid status and rejects unknown', () => {
    expect(StatusBody.parse({ status: 'completed' }).status).toBe('completed');
    expect(() => StatusBody.parse({ status: 'done' })).toThrow();
  });
  it('rejects negative or fractional step index', () => {
    expect(() => StepToggleBody.parse({ index: -1, checked: true })).toThrow();
    expect(() => StepToggleBody.parse({ index: 1.5, checked: true })).toThrow();
    expect(StepToggleBody.parse({ index: 0, checked: false })).toEqual({ index: 0, checked: false });
  });
  it('bounds difficulty and confidence to 1-5', () => {
    const base = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null };
    expect(() => JournalBody.parse({ ...base, difficulty: 6 })).toThrow();
    expect(() => JournalBody.parse({ ...base, confidence: 0 })).toThrow();
    expect(JournalBody.parse({ ...base, difficulty: 5, confidence: 1 })).toBeTruthy();
  });
  it('requires every ticket field to be a bounded string', () => {
    const fields = {
      ticketNumber: '',
      requester: '',
      issue: '',
      impact: '',
      troubleshootingSteps: '',
      rootCause: '',
      resolution: '',
      timeToResolve: '',
      followUp: '',
    };
    expect(TicketBody.parse(fields)).toEqual(fields);
    expect(() => TicketBody.parse({ ...fields, issue: 42 })).toThrow();
  });
  it('accepts only the four question ratings', () => {
    expect(QuestionReviewBody.parse({ rating: 'easy' })).toEqual({ rating: 'easy' });
    expect(() => QuestionReviewBody.parse({ rating: 'perfect' })).toThrow();
  });
  it('rejects unsafe slugs and ids in a backup', () => {
    const empty = { version: 1, exportedAt: 'x', labState: [], stepProgress: [], journals: [], attachments: [], activity: [] };
    expect(BackupSchema.parse(empty).tickets).toEqual([]);
    expect(BackupSchema.parse(empty).questionReviews).toEqual([]);
    const bad = { ...empty, attachments: [{ id: '../x', slug: 'a', fileName: 'a.png', mime: 'image/png', bytes: 1, createdAt: 'x', dataBase64: '' }] };
    expect(() => BackupSchema.parse(bad)).toThrow();
  });
});
