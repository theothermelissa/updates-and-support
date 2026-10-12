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
