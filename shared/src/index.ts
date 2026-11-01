import { z } from 'zod';

export const LAB_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export const TOPICS = [
  'ad-gpo',
  'm365-entra',
  'intune',
  'windows-troubleshooting',
  'powershell',
  'linux',
  'networking',
  'dns-dhcp',
  'backups',
  'security-hardening',
  'ticket-writeups',
  'docker',
] as const;
export type RotationTopic = (typeof TOPICS)[number];
export type Topic = RotationTopic | 'other';

export type ParseStatus = 'ok' | 'partial' | 'failed';
export const QUESTION_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type QuestionRating = (typeof QUESTION_RATINGS)[number];

export interface Step {
  index: number;
  key: string;
  textHash: string;
  text: string;
  section: string;
}
export interface Question {
  index: number;
  question: string;
  answerHtml: string;
}
export interface Section {
  kind: string;
  heading: string;
  html: string;
}

export interface Lab {
  slug: string;
  date: string;
  labNumber: number | null;
  title: string;
  topicLabel: string | null;
  topics: Topic[];
  tags: string[];
  timeEstimateMin: { low: number; high: number } | null;
  scenarioText: string | null;
  prerequisites: string[];
  steps: Step[];
  questions: Question[];
  sections: Section[];
  fileName: string;
  fileHash: string;
  parseStatus: ParseStatus;
  ingestedAt: string;
  missingFile?: boolean;
}

export interface LabState {
  status: LabStatus;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface Journal {
  bodyMd: string;
  timeTakenMin: number | null;
  difficulty: number | null;
  confidence: number | null;
  updatedAt: string | null;
}

export interface TicketFields {
  ticketNumber: string;
  requester: string;
  issue: string;
  impact: string;
  troubleshootingSteps: string;
  rootCause: string;
  resolution: string;
  timeToResolve: string;
  followUp: string;
}

export interface Ticket {
  fields: TicketFields;
  updatedAt: string | null;
}

export interface QuestionReview {
  slug: string;
  questionIndex: number;
  box: number;
  lastRating: QuestionRating;
  lastReviewed: string;
  dueDate: string;
}

export interface DueQuestion {
  slug: string;
  labTitle: string;
  labNumber: number | null;
  topics: Topic[];
  questionIndex: number;
  question: string;
  answerHtml: string;
  box: number;
  dueDate: string | null;
}

export interface LabSummary {
  slug: string;
  date: string;
  labNumber: number | null;
  title: string;
  topicLabel: string | null;
  topics: Topic[];
  tags: string[];
  timeEstimateMin: { low: number; high: number } | null;
  parseStatus: ParseStatus;
  missingFile: boolean;
  status: LabStatus;
  stepsTotal: number;
  stepsChecked: number;
  hasNotes: boolean;
}

export interface LabDetail {
  lab: Lab;
  state: LabState;
  checked: number[];
  journal: Journal | null;
  neighbors: { prev: string | null; next: string | null };
}

export interface TopicCoverage {
  topic: RotationTopic;
  count: number;
  completed: number;
  pct: number;
}

export interface Stats {
  completed: number;
  total: number;
  currentStreak: number;
  longestStreak: number;
  totalMinutes: number;
  avgDifficulty: number | null;
  questionsDue: number;
  topicCoverage: TopicCoverage[];
  today: LabSummary | null;
  recentJournals: { slug: string; title: string; snippet: string; updatedAt: string }[];
}

export interface LabEventPayload {
  type: 'lab:added' | 'lab:updated' | 'lab:removed';
  slug: string;
  title?: string;
}

export const StatusBody = z.object({ status: z.enum(LAB_STATUSES) });
export const StepToggleBody = z.object({ index: z.number().int().min(0), checked: z.boolean() });
export const JournalBody = z.object({
  bodyMd: z.string().max(200_000),
  timeTakenMin: z.number().int().min(0).max(100_000).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  confidence: z.number().int().min(1).max(5).nullable(),
});
export const TicketBody = z.object({
  ticketNumber: z.string().max(500),
  requester: z.string().max(2_000),
  issue: z.string().max(20_000),
  impact: z.string().max(20_000),
  troubleshootingSteps: z.string().max(100_000),
  rootCause: z.string().max(20_000),
  resolution: z.string().max(100_000),
  timeToResolve: z.string().max(2_000),
  followUp: z.string().max(20_000),
});
export const QuestionReviewBody = z.object({ rating: z.enum(QUESTION_RATINGS) });

const Slug = z.string().regex(/^[a-z0-9-]+$/);
const Uuid = z.string().regex(/^[0-9a-f-]{36}$/);
const Mime = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  labState: z.array(
    z.object({
      slug: Slug,
      status: z.enum(LAB_STATUSES),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      updatedAt: z.string().nullable(),
    }),
  ),
  stepProgress: z.array(
    z.object({
      slug: Slug,
      stepIndex: z.number().int().min(0),
      textHash: z.string(),
      checked: z.boolean(),
      checkedAt: z.string().nullable(),
    }),
  ),
  journals: z.array(
    z.object({
      slug: Slug,
      bodyMd: z.string(),
      timeTakenMin: z.number().int().nullable(),
      difficulty: z.number().int().min(1).max(5).nullable(),
      confidence: z.number().int().min(1).max(5).nullable(),
      updatedAt: z.string().nullable(),
    }),
  ),
  tickets: z
    .array(
      z.object({
        slug: Slug,
        fields: TicketBody,
        updatedAt: z.string().nullable(),
      }),
    )
    .default([]),
  questionReviews: z
    .array(
      z.object({
        slug: Slug,
        questionIndex: z.number().int().min(0),
        box: z.number().int().min(1).max(5),
        lastRating: z.enum(QUESTION_RATINGS),
        lastReviewed: z.string(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .default([]),
  attachments: z.array(
    z.object({
      id: Uuid,
      slug: Slug,
      fileName: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/),
      mime: Mime,
      bytes: z.number().int().min(0),
      createdAt: z.string(),
      dataBase64: z.string(),
    }),
  ),
  activity: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      slug: Slug,
      kind: z.string(),
      at: z.string(),
    }),
  ),
});
export type BackupV1 = z.infer<typeof BackupSchema>;
