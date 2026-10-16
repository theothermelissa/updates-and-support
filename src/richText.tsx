import { Fragment, type ReactNode } from "react";
import { allowedHref } from "./lib/links.js";

// Shared by the renderer and the editor, so an update looks the same while it's written.
// Paragraphs are a line apart, so a blank line in an older update looks as it always has.
export const DOC_CLASSES =
  "space-y-[1lh] break-words whitespace-pre-wrap [&_li]:mt-1 [&_li>*+*]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6";

// Deep enough for any document the server accepts.
const MAX_DEPTH = 20;

type Obj = Record<string, unknown>;

// Draws an update's document with React elements only: text is always a text child, never
// HTML. Anything unexpected is skipped rather than thrown, so one bad update can't break
// the feed, and a link the server should have refused is drawn as plain text.
export function RichText({ doc, className }: { doc: unknown; className?: string }) {
  let content: ReactNode;
  try {
    content = isObj(doc) ? children(doc, 0) : null;
  } catch {
    content = null;
  }
  return <div className={`${DOC_CLASSES} ${className ?? ""}`}>{content}</div>;
}

function children(parent: Obj, depth: number): ReactNode {
  if (!Array.isArray(parent.content) || depth > MAX_DEPTH) return null;
  return parent.content.map((child, i) => (isObj(child) ? node(child, i, depth + 1) : null));
}

function node(n: Obj, key: number, depth: number): ReactNode {
  switch (n.type) {
    case "paragraph": {
      const inner = children(n, depth);
      return <p key={key}>{Array.isArray(n.content) && n.content.length > 0 ? inner : <br />}</p>;
    }
    case "bulletList":
      return <ul key={key}>{children(n, depth)}</ul>;
    case "orderedList": {
      const start = isObj(n.attrs) && Number.isInteger(n.attrs.start) ? (n.attrs.start as number) : undefined;
      return (
        <ol key={key} start={start}>
          {children(n, depth)}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children(n, depth)}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "photo": {
      const caption = isObj(n.attrs) && typeof n.attrs.caption === "string" ? n.attrs.caption : "";
      return (
        <figure key={key} className="space-y-2 whitespace-normal">
          <div className="aspect-[4/3] w-full rounded-lg bg-muted" role="img" aria-label="Placeholder photo" />
          {caption && <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>}
        </figure>
      );
    }
    case "text":
      return typeof n.text === "string" ? <Fragment key={key}>{marked(n.text, n.marks)}</Fragment> : null;
    default:
      return null;
  }
}

function marked(text: string, marks: unknown): ReactNode {
  let out: ReactNode = text;
  if (!Array.isArray(marks)) return out;
  for (const m of marks) {
    if (!isObj(m)) continue;
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "link" && isObj(m.attrs) && allowedHref(m.attrs.href)) {
      out = (
        <a href={m.attrs.href} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      );
    }
  }
  return out;
}

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
