import { useMemo } from 'react';
import type { Section } from '@lab-ledger/shared';
import { sanitizeSectionHtml } from '../lib/sections';

export function SectionReader({ sections, slug }: { sections: Section[]; slug: string }) {
  const content = useMemo(
    () =>
      sections.map((section, index) => ({
        id: `reading-${slug}-${index}`,
        heading: section.heading || `Section ${index + 1}`,
        html: sanitizeSectionHtml(section.html),
      })),
    [sections, slug],
  );

  if (content.length === 0) {
    return (
      <p className="card">No readable sections were found. Use Original to read the lab source.</p>
    );
  }

  return (
    <div className="section-reader">
      <p className="muted">Reading view. Use the Steps panel to record your progress.</p>
      <nav aria-label="Lab sections">
        <h2>Contents</h2>
        <ol>
          {content.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.heading}</a>
            </li>
          ))}
        </ol>
      </nav>
      {content.map((section) => (
        <section key={section.id} aria-labelledby={section.id}>
          <h2 id={section.id} tabIndex={-1}>
            {section.heading}
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section.html }} />
        </section>
      ))}
    </div>
  );
}
