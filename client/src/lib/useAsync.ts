import { useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const lastKey = useRef('');

  useEffect(() => {
    const key = JSON.stringify(deps);
    const depsChanged = key !== lastKey.current;
    lastKey.current = key;
    let alive = true;
    setState((s) => (depsChanged ? { loading: true } : { ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [JSON.stringify(deps), tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
