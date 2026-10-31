import { useRef, useState } from 'react';
import { api } from '../lib/api';

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  async function rescan() {
    const r = await api.rescan();
    setMessage(`Rescan done: ${r.added.length} added, ${r.updated.length} updated, ${r.removed.length} removed.`);
  }

  async function restore() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!window.confirm('Restoring replaces ALL progress, journals and screenshots. Continue?')) return;
    try {
      await api.restore(JSON.parse(await file.text()));
      setMessage('Restore complete. Reload the page to see restored data.');
    } catch (err) {
      setMessage(`Restore failed: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Backup</h2>
        <p>
          <a href="/api/backup" download>Download JSON backup</a> · <a href="/api/backup/markdown" download>Download Markdown notes</a>
        </p>
        <label>
          Restore from JSON backup <input ref={fileRef} type="file" accept="application/json,.json" />
        </label>{' '}
        <button type="button" onClick={restore}>Restore</button>
      </section>
      <section className="card">
        <h2>Labs folder</h2>
        <button type="button" onClick={rescan}>Rescan now</button>
      </section>
      <p role="status">{message}</p>
    </>
  );
}
