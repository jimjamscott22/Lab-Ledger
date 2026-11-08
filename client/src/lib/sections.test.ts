// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSectionHtml } from './sections';

function render(html: string) {
  const root = document.createElement('div');
  root.innerHTML = sanitizeSectionHtml(html);
  return root;
}

describe('section HTML', () => {
  it('keeps readable structure, commands, tables and answer disclosures', () => {
    const root = render(
      '<p>Run <code>whoami</code></p><pre>&lt;user&gt;</pre><table><tr><th scope="col">Name</th><td>Pat</td></tr></table><details><summary>Why?</summary><p>An answer</p></details>',
    );
    expect(root.querySelector('pre')?.textContent).toBe('<user>');
    expect(root.querySelector('th')?.getAttribute('scope')).toBe('col');
    expect(root.querySelector('summary')?.textContent).toBe('Why?');
    expect(root.textContent).toContain('An answer');
  });

  it('removes active content, forms, source styling and document identifiers', () => {
    const root = render(
      '<style>body{display:none}</style><script>alert(1)</script><iframe src="/api/backup"></iframe><form action="/api/restore"><label id="main" style="color:red" class="topbar" onclick="alert(1)"><input type="checkbox" checked>Save progress</label><button>Submit</button></form><svg onload="alert(1)"></svg><p tabindex="0" name="app" data-action="submit" aria-label="Spoof">Text</p>',
    );
    expect(root.querySelector('style, script, iframe, form, input, button, svg')).toBeNull();
    expect(
      root.querySelector(
        '[style], [id], [class], [onclick], [tabindex], [name], [data-action], [aria-label]',
      ),
    ).toBeNull();
    expect(root.textContent).toContain('Save progress');
  });

  it('retains link text without navigation and permits only embedded raster images', () => {
    const root = render(
      '<a href="javascript:alert(1)">Reference</a><img src="https://example.com/track" alt="Diagram"><img src="/api/backup" alt="Local"><img src="data:image/svg+xml;base64,AAAA" alt="SVG"><img src="data:image/png;base64,AAAA" alt="Embedded" onerror="alert(1)"><img srcset="https://example.com/x 2x" alt="Responsive">',
    );
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(root.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(root.querySelector('[onerror], [srcset]')).toBeNull();
    expect(root.textContent).toContain('ReferenceDiagramLocalSVG');
  });
});
