import DOMPurify from 'dompurify';

/** Render lab content in the app without importing the original document's UI or styling. */
export function sanitizeSectionHtml(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'div',
      'span',
      'br',
      'hr',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'small',
      'sub',
      'sup',
      'ul',
      'ol',
      'li',
      'dl',
      'dt',
      'dd',
      'pre',
      'code',
      'kbd',
      'samp',
      'blockquote',
      'table',
      'caption',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'details',
      'summary',
      'img',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'title', 'colspan', 'rowspan', 'scope', 'open', 'start'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  // DOMPurify permits ordinary image URLs; the reader has the same local-only
  // resource policy as the raw iframe and accepts only embedded raster images.
  for (const img of fragment.querySelectorAll('img')) {
    if (
      !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(img.getAttribute('src') ?? '')
    ) {
      img.replaceWith(document.createTextNode(img.getAttribute('alt') ?? ''));
    }
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
