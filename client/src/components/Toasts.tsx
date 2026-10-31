import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLabEvents } from '../lib/events';

type Toast = { text: string; to?: string };
const Ctx = createContext<(m: Toast) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<(Toast & { id: number })[]>([]);
  const push = useCallback((m: Toast) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, ...m }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 8000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.to ? <Link to={t.to}>{t.text}</Link> : t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function LiveEvents() {
  const toast = useToast();
  useLabEvents((e) => {
    if (e.type === 'lab:added') toast({ text: `New lab: ${e.title ?? e.slug}`, to: `/labs/${e.slug}` });
  });
  return null;
}
