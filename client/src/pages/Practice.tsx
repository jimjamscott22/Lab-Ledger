import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  QUESTION_RATINGS,
  TOPICS,
  type DueQuestion,
  type QuestionRating,
} from '@lab-ledger/shared';
import { api } from '../lib/api';
import { isTyping, useHotkeys } from '../lib/hotkeys';
import { sanitizeHtml } from '../lib/markdown';
import { useAsync } from '../lib/useAsync';

const RATING_LABELS: Record<QuestionRating, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const cardKey = (question: DueQuestion) => `${question.slug}#${question.questionIndex}`;

export default function Practice() {
  const [topic, setTopic] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState<QuestionRating | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const { data, error, loading, reload } = useAsync(
    () => api.dueQuestions(topic || undefined),
    [topic],
  );
  const deck = data?.filter((question) => !dismissedKeys.includes(cardKey(question))) ?? [];
  const current = deck[0];

  useEffect(() => {
    setDismissedKeys([]);
  }, [data]);

  useEffect(() => {
    setRevealed(false);
  }, [current?.slug, current?.questionIndex]);

  async function rate(nextRating: QuestionRating) {
    if (!current || rating) return;
    const reviewedKey = cardKey(current);
    setRating(nextRating);
    try {
      await api.reviewQuestion(current.slug, current.questionIndex, nextRating);
      setDismissedKeys((keys) => (keys.includes(reviewedKey) ? keys : [...keys, reviewedKey]));
      setRevealed(false);
      reload();
    } finally {
      setRating(null);
    }
  }

  useHotkeys((event) => {
    if (!current || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      setRevealed(true);
      return;
    }
    const ratingIndex = Number(event.key) - 1;
    if (revealed && ratingIndex >= 0 && ratingIndex < QUESTION_RATINGS.length) {
      event.preventDefault();
      void rate(QUESTION_RATINGS[ratingIndex]);
    }
  });

  return (
    <>
      <div className="practice-head">
        <div>
          <h1>Interview practice</h1>
          <p>Review due questions using Leitner boxes.</p>
        </div>
        <label>
          Topic
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="">All topics</option>
            {TOPICS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p role="alert">Could not load questions: {error.message}</p> : null}
      <p role="status" aria-live="polite">
        {loading ? 'Loading questions…' : `${data?.length ?? 0} due today`}
      </p>

      {!loading && !current ? (
        <section className="card practice-empty">
          <h2>You&apos;re caught up</h2>
          <p>No questions are due for this topic.</p>
        </section>
      ) : null}

      {current ? (
        <section className="card practice-card" aria-labelledby="practice-question">
          <p className="practice-meta">
            Lab {current.labNumber ?? '?'} · Box {current.box} ·{' '}
            <Link to={`/labs/${current.slug}`}>{current.labTitle}</Link>
          </p>
          <h2 id="practice-question">{current.question}</h2>

          {!revealed ? (
            <button type="button" className="primary" onClick={() => setRevealed(true)}>
              Reveal answer <kbd>R</kbd>
            </button>
          ) : (
            <>
              <div
                className="practice-answer"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.answerHtml) }}
              />
              <div className="practice-ratings" aria-label="Rate this answer">
                {QUESTION_RATINGS.map((value, index) => (
                  <button
                    type="button"
                    key={value}
                    disabled={rating !== null}
                    onClick={() => void rate(value)}
                  >
                    <kbd>{index + 1}</kbd> {RATING_LABELS[value]}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      <p className="label">Shortcuts: R reveals; 1–4 rates Again, Hard, Good, or Easy.</p>
    </>
  );
}
