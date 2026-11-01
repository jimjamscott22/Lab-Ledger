import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
