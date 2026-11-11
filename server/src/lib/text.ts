import * as cheerio from 'cheerio';

// Just the parts of a DOM node the walker reads.
type Node = { type: string; name?: string; data?: string; children?: Node[] };

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'summary', 'table', 'tr', 'ul',
]);

/**
 * Plain text from an HTML fragment, with one line per block element (and per <br>).
 * Whitespace inside a line is collapsed; blank lines are dropped.
 */
export function blockText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style').remove();
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.type === 'text') {
      out.push(node.data ?? '');
      return;
    }
    if (node.type !== 'tag' && node.type !== 'root') return;
    const name = node.name ?? '';
    if (name === 'br') {
      out.push('\n');
      return;
    }
    const block = BLOCK_TAGS.has(name);
    if (block) out.push('\n');
    for (const child of node.children ?? []) walk(child);
    if (block) out.push('\n');
  };
  walk($.root()[0] as unknown as Node);
  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
