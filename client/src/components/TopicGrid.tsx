import type { TopicCoverage } from '@lab-ledger/shared';

export function TopicGrid({ coverage }: { coverage: TopicCoverage[] }) {
  return (
    <ul className="topics" aria-label="Topic coverage">
      {coverage.map((t) => (
        <li key={t.topic}>
          <div>{t.topic}</div>
          <div className="label">
            {t.completed}/{t.count} done ({t.pct}%)
          </div>
          <div className="bar" role="presentation">
            <span style={{ width: `${t.pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
