import { Link } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { TopicGrid } from '../components/TopicGrid';
import { api } from '../lib/api';
import { useLabEvents } from '../lib/events';
import { useAsync } from '../lib/useAsync';

const hours = (min: number) => `${(min / 60).toFixed(1)} h`;

export default function Home() {
  const { data, error, reload } = useAsync(() => api.stats(), []);
  useLabEvents(() => reload());

  if (error) return <p role="alert">Could not load stats: {error.message}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="cards">
        <StatCard label="Completed" value={`${data.completed}/${data.total}`} />
        <StatCard label="Current streak" value={`${data.currentStreak} d`} hint={`Best ${data.longestStreak} d`} />
        <StatCard label="Time logged" value={hours(data.totalMinutes)} />
        <StatCard label="Avg difficulty" value={data.avgDifficulty === null ? '–' : `${data.avgDifficulty} / 5`} />
        <StatCard label="Questions due" value={String(data.questionsDue)} />
      </div>

      <section className="card" aria-labelledby="today-h">
        <h2 id="today-h">Today&apos;s lab</h2>
        {data.today ? (
          <p>
            Lab {data.today.labNumber ?? '?'} – {data.today.title}{' '}
            <Link to={`/labs/${data.today.slug}`}>Open</Link>
          </p>
        ) : (
          <p>No labs yet.</p>
        )}
      </section>

      <section className="card" aria-labelledby="practice-h">
        <h2 id="practice-h">Interview practice</h2>
        <p>
          {data.questionsDue} question{data.questionsDue === 1 ? '' : 's'} due today.{' '}
          <Link to="/practice">Practice now</Link>
        </p>
      </section>

      <h2>Topic coverage</h2>
      <TopicGrid coverage={data.topicCoverage} />

      <h2>Recent notes</h2>
      {data.recentJournals.length === 0 ? (
        <p>No journal entries yet.</p>
      ) : (
        <ul className="lab-list">
          {data.recentJournals.map((j) => (
            <li key={j.slug} className="lab-card">
              <span>
                <Link to={`/labs/${j.slug}`}>{j.title}</Link> <span className="label">{j.snippet}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
