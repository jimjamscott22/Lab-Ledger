export interface LogEntry {
  date: string;
  labNumber: number;
  topicLabel: string;
  slug: string;
}

const LINE_RE = /^(\d{4}-\d{2}-\d{2})\s*\|\s*Lab\s+(\d+)\s*\|\s*(.+?)\s*\|\s*([a-z0-9-]+)\s*$/;

export function parseLabLog(text: string): Map<string, LogEntry> {
  const out = new Map<string, LogEntry>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    out.set(m[4], { date: m[1], labNumber: Number(m[2]), topicLabel: m[3], slug: m[4] });
  }
  return out;
}
