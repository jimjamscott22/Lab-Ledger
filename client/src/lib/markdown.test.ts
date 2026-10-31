// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings and keeps attachment images', () => {
    const html = renderMarkdown('## Title\n\n![shot](/api/attachments/abc)');
    expect(html).toContain('<h2');
    expect(html).toContain('<img');
    expect(html).toContain('/api/attachments/abc');
  });
  it('strips scripts and inline handlers', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });
});
