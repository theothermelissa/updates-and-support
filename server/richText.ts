import type { Block, Doc, HardBreak, ListItem, Mark, Paragraph, Photo, Text } from "../src/lib/doc.js";
import { allowedHref, linkify } from "../src/lib/links.js";
import { isFamilyPhotoId } from "./cloudinary.js";
import { RequestError } from "./errors.js";
import { NO_PHOTOS, type PhotoSettings } from "./photoSettings.js";

const MAX_TEXT = 20_000;
const MAX_NODES = 10_000;
const MAX_DEPTH = 10;
const MAX_MARKS = 3;
const MIN_START = 1;
const MAX_START = 9_999;
const MAX_PHOTOS = 6;
const MAX_CAPTION = 300;

// Attributes Tiptap writes on every link. They're accepted and dropped; only href is kept.
const LINK_EXTRAS = ["target", "rel", "class", "title"];

const unsupported = () => new RequestError(400, "This update has formatting the app doesn't support");

// familyId checks a real photo's id. kept is the ids already on the update being edited:
// those stay valid after Cloudinary is turned off.
export type PhotoCheck = { familyId: string; kept?: ReadonlySet<string> };

type Walk = {
  nodes: number;
  chars: number;
  visible: boolean;
  photos: number;
  settings: PhotoSettings;
  check?: PhotoCheck;
  seen: Set<string>;
};
type Obj = Record<string, unknown>;

// Checks a document sent by the editor and returns a new one built only from the fields it
// checked, so nothing unexpected can reach the database. Anything not allowed is a 400.
export function validDoc(input: unknown, settings: PhotoSettings = NO_PHOTOS, check?: PhotoCheck): Doc {
  const walk: Walk = { nodes: 0, chars: 0, visible: false, photos: 0, settings, check, seen: new Set() };
  const doc = node(input, 1, walk, ["content"]);
  if (doc.type !== "doc") throw unsupported();
  const content = children(doc, 1, walk, topLevel, true);
  if (!walk.visible) throw new RequestError(400, "An update can't be empty");
  return { type: "doc", content };
}

// What a request sends as an update: content, or for pages loaded before formatting, the
// plain text body. Returns the checked document and its plain text, stored side by side.
export function contentFrom(
  input: { content?: unknown; body?: unknown },
  settings: PhotoSettings = NO_PHOTOS,
  check?: PhotoCheck,
): { content: Doc; body: string } {
  let content: Doc;
  if (input.content !== undefined) content = validDoc(input.content, settings, check);
  else if (typeof input.body === "string") content = validDoc(docFromText(input.body.trim()));
  else throw new RequestError(400, "Expected the update's content");
  return { content, body: textOf(content) };
}

// The document to show for a stored update. Updates posted before formatting have no
// content, and code from before formatting changes only body, so body wins whenever the
// two disagree.
export function shownContent(stored: unknown, body: string): Doc {
  try {
    if (stored !== null && textOf(stored as Doc) === body) return stored as Doc;
  } catch {
    // A malformed document falls back to body.
  }
  return docFromText(body);
}

// Plain text as a document: a paragraph per "\n\n", hard breaks for the remaining newlines,
// and web addresses as links. textOf gives the text back exactly.
export function docFromText(text: string): Doc {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n\n");
  return {
    type: "doc",
    content: paragraphs.map((paragraph): Paragraph => {
      const inline: (Text | HardBreak)[] = [];
      paragraph.split("\n").forEach((line, i) => {
        if (i > 0) inline.push({ type: "hardBreak" });
        for (const segment of linkify(line)) {
          if ("text" in segment) inline.push({ type: "text", text: segment.text });
          else if (allowedHref(segment.href))
            inline.push({ type: "text", text: segment.href, marks: [{ type: "link", attrs: { href: segment.href } }] });
          else inline.push({ type: "text", text: segment.href });
        }
      });
      return inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" };
    }),
  };
}

// A document as plain text, for the body column, the wall, and code from before formatting:
// paragraphs separated by blank lines, list items as "- " or "1. " lines, indented when nested,
// and photos as "[Photo]" or "[Photo: caption]".
export function textOf(doc: Doc): string {
  return blocksText(doc.content, "\n\n", "");
}

export function photoCount(doc: Doc): number {
  return doc.content.filter((b) => b.type === "photo").length;
}

function blocksText(blocks: (Block | Photo)[], separator: string, indent: string): string {
  return blocks
    .map((b) => {
      if (b.type === "photo") return b.attrs.caption ? `[Photo: ${b.attrs.caption}]` : "[Photo]";
      if (b.type === "paragraph") return indent + paragraphText(b);
      return b.content
        .map((item, i) => {
          const marker = b.type === "orderedList" ? `${b.attrs.start + i}. ` : "- ";
          const [first, ...rest] = item.content;
          const nested = rest.map((r) => "\n" + blocksText([r], "\n", `${indent}  `)).join("");
          return indent + marker + paragraphText(first as Paragraph) + nested;
        })
        .join("\n");
    })
    .join(separator);
}

function paragraphText(p: Paragraph): string {
  return (p.content ?? []).map((n) => (n.type === "text" ? n.text : "\n")).join("");
}

// Counts the node against the limits and checks it has only "type" and the given keys.
function node(input: unknown, depth: number, walk: Walk, keys: string[]): Obj {
  if (++walk.nodes > MAX_NODES) throw new RequestError(400, "This update is too long");
  if (depth > MAX_DEPTH) throw new RequestError(400, "This update's lists are nested too deeply");
  if (!isObj(input) || typeof input.type !== "string") throw unsupported();
  onlyKeys(input, ["type", ...keys]);
  return input;
}

function children<T>(
  parent: Obj,
  depth: number,
  walk: Walk,
  check: (input: unknown, depth: number, walk: Walk) => T,
  required: boolean,
): T[] {
  if (parent.content === undefined && !required) return [];
  if (!Array.isArray(parent.content) || (required && parent.content.length === 0)) throw unsupported();
  return parent.content.map((child) => check(child, depth + 1, walk));
}

function topLevel(input: unknown, depth: number, walk: Walk): Block | Photo {
  return isObj(input) && input.type === "photo" ? photo(input, depth, walk) : block(input, depth, walk);
}

// Photos come only from "Add photo": a placeholder on a test site, or a public id this server issued.
function photo(input: unknown, depth: number, walk: Walk): Photo {
  const n = node(input, depth, walk, ["attrs"]);
  if (!isObj(n.attrs)) throw unsupported();
  // The feed may send a photo's url; it's never stored.
  onlyKeys(n.attrs, ["caption", "placeholder", "publicId", "url"]);
  const { caption } = n.attrs;
  if (typeof caption !== "string") throw unsupported();
  const placeholderKey = Object.hasOwn(n.attrs, "placeholder");
  const publicIdKey = Object.hasOwn(n.attrs, "publicId");
  if (placeholderKey === publicIdKey) throw unsupported();
  if (++walk.photos > MAX_PHOTOS) throw new RequestError(400, `An update can have at most ${MAX_PHOTOS} photos`);
  const trimmed = caption.trim();
  if (trimmed.length > MAX_CAPTION) {
    throw new RequestError(400, `A caption can have at most ${MAX_CAPTION} characters`);
  }
  walk.visible = true;
  if (placeholderKey) return placeholderPhoto(n.attrs.placeholder, trimmed, walk);
  return realPhoto(n.attrs.publicId, trimmed, walk);
}

function placeholderPhoto(placeholder: unknown, caption: string, walk: Walk): Photo {
  if (placeholder !== true) throw unsupported();
  if (!walk.settings.placeholders) {
    throw new RequestError(400, "Placeholder photos are turned off on this site. Remove the grey photo boxes to save.");
  }
  return { type: "photo", attrs: { caption, placeholder: true } };
}

function realPhoto(publicId: unknown, caption: string, walk: Walk): Photo {
  if (typeof publicId !== "string" || !isFamilyPhotoId(walk.check?.familyId ?? "", publicId)) {
    throw new RequestError(400, "This photo can't be added to this update");
  }
  if (walk.seen.has(publicId)) throw new RequestError(400, "A photo can only be added once");
  walk.seen.add(publicId);
  const kept = walk.check?.kept?.has(publicId) ?? false;
  if (!kept && !walk.settings.cloudinary) throw new RequestError(400, "Photos are turned off on this site.");
  return { type: "photo", attrs: { caption, publicId } };
}

function block(input: unknown, depth: number, walk: Walk): Block {
  const n = node(input, depth, walk, ["content", "attrs"]);
  if (n.type === "paragraph") {
    if (n.attrs !== undefined) throw unsupported();
    const content = children(n, depth, walk, inline, false);
    return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
  }
  if (n.type === "bulletList") {
    if (n.attrs !== undefined) throw unsupported();
    return { type: "bulletList", content: children(n, depth, walk, listItem, true) };
  }
  if (n.type === "orderedList") {
    // Pasted lists bring their source's numbering and style, so these are normalized, not refused.
    let start = MIN_START;
    if (n.attrs !== undefined) {
      if (!isObj(n.attrs)) throw unsupported();
      onlyKeys(n.attrs, ["start", "type"]);
      const { start: s, type } = n.attrs;
      if (type !== undefined && type !== null && typeof type !== "string") throw unsupported();
      if (Number.isInteger(s) && (s as number) >= MIN_START && (s as number) <= MAX_START) start = s as number;
    }
    return { type: "orderedList", attrs: { start, type: null }, content: children(n, depth, walk, listItem, true) };
  }
  throw unsupported();
}

function listItem(input: unknown, depth: number, walk: Walk): ListItem {
  const n = node(input, depth, walk, ["content"]);
  if (n.type !== "listItem") throw unsupported();
  const content = children(n, depth, walk, block, true);
  if (content[0]!.type !== "paragraph") throw unsupported();
  return { type: "listItem", content };
}

function inline(input: unknown, depth: number, walk: Walk): Text | HardBreak {
  const n = node(input, depth, walk, ["text", "marks"]);
  if (n.type === "hardBreak") {
    // The editor can carry formatting onto a line break; it means nothing there.
    if (n.text !== undefined) throw unsupported();
    if (n.marks !== undefined) marks(n.marks);
    return { type: "hardBreak" };
  }
  if (n.type !== "text") throw unsupported();
  const { text } = n;
  if (typeof text !== "string" || text.length === 0 || /[\r\n]/.test(text)) throw unsupported();
  walk.chars += text.length;
  if (walk.chars > MAX_TEXT) {
    throw new RequestError(400, `An update can have at most ${MAX_TEXT.toLocaleString("en-US")} characters`);
  }
  if (text.trim()) walk.visible = true;
  if (n.marks === undefined) return { type: "text", text };
  const checked = marks(n.marks);
  return checked.length > 0 ? { type: "text", text, marks: checked } : { type: "text", text };
}

function marks(input: unknown): Mark[] {
  if (!Array.isArray(input) || input.length > MAX_MARKS) throw unsupported();
  const seen = new Set<string>();
  return input.map((m): Mark => {
    if (!isObj(m) || typeof m.type !== "string" || seen.has(m.type)) throw unsupported();
    seen.add(m.type);
    if (m.type === "bold" || m.type === "italic") {
      onlyKeys(m, ["type"]);
      return { type: m.type };
    }
    if (m.type !== "link") throw unsupported();
    onlyKeys(m, ["type", "attrs"]);
    if (!isObj(m.attrs)) throw unsupported();
    onlyKeys(m.attrs, ["href", ...LINK_EXTRAS]);
    const { href } = m.attrs;
    if (!allowedHref(href)) throw new RequestError(400, "Links must start with https://, http://, or mailto:");
    return { type: "link", attrs: { href } };
  });
}

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(obj: Obj, allowed: string[]) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw unsupported();
}
