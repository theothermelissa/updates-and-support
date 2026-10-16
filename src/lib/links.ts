// Shared by the server's validator and the browser's editor and renderer, so they always
// agree on which links are allowed.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const MAX_HREF = 2_000;

// Whether an address may be a link in an update: http, https, or mailto only. Whitespace
// and control characters are refused rather than cleaned up, since browsers strip them
// (turning "java\nscript:" into "javascript:").
export function allowedHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length > MAX_HREF || /[\s\x00-\x1f\x7f]/.test(href)) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

export type Segment = { text: string } | { href: string };

// Only http(s) addresses become links, so a body can never produce a javascript: link.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
// Punctuation that usually ends the sentence rather than the address.
const TRAILING = /[.,;:!?)\]'"]+$/;

// Splits update text into plain text and links, for rendering as React elements.
export function linkify(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = match[0].replace(TRAILING, "");
    const start = match.index;
    if (start > last) segments.push({ text: text.slice(last, start) });
    segments.push({ href });
    last = start + href.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
