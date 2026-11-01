import type {
  DueQuestion,
  QuestionRating,
  QuestionReview,
  Topic,
} from '@lab-ledger/shared';
import type { Db } from './db/open';
import * as repo from './db/repo';

export const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function nextBox(currentBox: number, rating: QuestionRating): number {
  switch (rating) {
    case 'again':
      return 1;
    case 'hard':
      return Math.max(1, currentBox - 1);
    case 'good':
      return Math.min(5, currentBox + 1);
    case 'easy':
      return Math.min(5, currentBox + 2);
  }
}

interface ReviewRow {
  slug: string;
  q_index: number;
  box: number;
  last_rating: QuestionRating;
  last_reviewed: string;
  due_date: string;
}

function hydrateReview(row: ReviewRow): QuestionReview {
  return {
    slug: row.slug,
    questionIndex: row.q_index,
    box: row.box,
    lastRating: row.last_rating,
    lastReviewed: row.last_reviewed,
    dueDate: row.due_date,
  };
}

export function getQuestionReview(db: Db, slug: string, questionIndex: number): QuestionReview | null {
  const row = db
    .prepare(
      `SELECT slug, q_index, box, last_rating, last_reviewed, due_date
       FROM question_reviews WHERE slug=? AND q_index=?`,
    )
    .get(slug, questionIndex) as ReviewRow | undefined;
  return row ? hydrateReview(row) : null;
}

export function reviewQuestion(
  db: Db,
  slug: string,
  questionIndex: number,
  rating: QuestionRating,
  nowIso: string,
  today: string,
): QuestionReview {
  const box = nextBox(getQuestionReview(db, slug, questionIndex)?.box ?? 1, rating);
  const dueDate = addDays(today, LEITNER_INTERVAL_DAYS[box - 1]);
  db.prepare(
    `INSERT INTO question_reviews
       (slug, q_index, box, last_rating, last_reviewed, due_date)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(slug, q_index) DO UPDATE SET
       box=excluded.box, last_rating=excluded.last_rating,
       last_reviewed=excluded.last_reviewed, due_date=excluded.due_date`,
  ).run(slug, questionIndex, box, rating, nowIso, dueDate);
  return getQuestionReview(db, slug, questionIndex)!;
}

export function listDueQuestions(
  db: Db,
  today: string,
  topic?: Topic,
): DueQuestion[] {
  const reviews = new Map(
    (
      db
        .prepare(
          'SELECT slug, q_index, box, last_rating, last_reviewed, due_date FROM question_reviews',
        )
        .all() as ReviewRow[]
    ).map((row) => [`${row.slug}#${row.q_index}`, row]),
  );

  return repo
    .listLabs(db)
    .filter((lab) => !lab.missingFile && (!topic || lab.topics.includes(topic)))
    .flatMap((lab) =>
      lab.questions.flatMap((question) => {
        const review = reviews.get(`${lab.slug}#${question.index}`);
        if (review && review.due_date > today) return [];
        return [
          {
            slug: lab.slug,
            labTitle: lab.title,
            labNumber: lab.labNumber,
            topics: lab.topics,
            questionIndex: question.index,
            question: question.question,
            answerHtml: question.answerHtml,
            box: review?.box ?? 1,
            dueDate: review?.due_date ?? null,
          },
        ];
      }),
    );
}
