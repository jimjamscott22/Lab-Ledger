import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../lib/api';

export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'open' | 'locked'>('loading');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .authStatus()
      .then((status) => {
        if (cancelled) return;
        setPhase(status.required && !status.authenticated ? 'locked' : 'open');
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not reach the server.');
          setPhase('locked');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api.unlock(token);
      setPhase('open');
    } catch {
      setError('That token was not accepted.');
    } finally {
      setPending(false);
    }
  }

  if (phase === 'loading') return <p>Loading…</p>;
  if (phase === 'open') return children;
  return (
    <form className="card auth-gate" onSubmit={(event) => void submit(event)}>
      <h1>Unlock Lab Ledger</h1>
      <p>This server is reachable beyond this computer. Enter its access token to continue.</p>
      <label>
        Access token
        <input
          type="password"
          value={token}
          autoComplete="current-password"
          onChange={(event) => setToken(event.target.value)}
          required
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="primary" disabled={pending}>
        Unlock
      </button>
    </form>
  );
}
