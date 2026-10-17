import { Fragment, useState, type ReactNode } from "react";
import { allowedHref } from "./lib/links.js";

// Shared by the renderer and the editor, so an update looks the same while it's written.
// Paragraphs are a line apart, so a blank line in an older update looks as it always has.
export const DOC_CLASSES =
  "space-y-[1lh] break-words whitespace-pre-wrap [&_li]:mt-1 [&_li>*+*]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-foreground/20 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote>*+*]:mt-[1lh]";

// Deep enough for any document the server accepts.
const MAX_DEPTH = 20;

type Obj = Record<string, unknown>;

// Draws an update's document with React elements only: text is always a text child, never
// HTML. Anything unexpected is skipped rather than thrown, so one bad update can't break
// the feed, and a link the server should have refused is drawn as plain text.
// trailing, such as a request's count, ends the last paragraph, or follows a final list or
// quote in a paragraph of its own.
export function RichText({ doc, className, trailing }: { doc: unknown; className?: string; trailing?: ReactNode }) {
  let content: ReactNode;
  let last: unknown;
  try {
    const total = isObj(doc) && Array.isArray(doc.content) ? doc.content.filter((c) => isObj(c) && c.type === "photo").length : 0;
    content = isObj(doc) ? children(doc, 0, { n: 0, total }, trailing) : null;
    last = isObj(doc) && Array.isArray(doc.content) ? doc.content.at(-1) : undefined;
  } catch {
    content = null;
  }
  const ownLine = trailing !== undefined && !(isObj(last) && last.type === "paragraph");
  return (
    <div className={`${DOC_CLASSES} ${className ?? ""}`}>
      {content}
      {ownLine && <p>{trailing}</p>}
    </div>
  );
}

type Photos = { n: number; total: number };

// trailing is passed only for the document's own children, and lands in the last one.
function children(parent: Obj, depth: number, photos: Photos, trailing?: ReactNode): ReactNode {
  if (!Array.isArray(parent.content) || depth > MAX_DEPTH) return null;
  const lastIndex = parent.content.length - 1;
  return parent.content.map((child, i) =>
    isObj(child) ? node(child, i, depth + 1, photos, i === lastIndex ? trailing : undefined) : null,
  );
}

function node(n: Obj, key: number, depth: number, photos: Photos, trailing?: ReactNode): ReactNode {
  switch (n.type) {
    case "paragraph": {
      const inner = children(n, depth, photos);
      const empty = !(Array.isArray(n.content) && n.content.length > 0);
      return (
        <p key={key}>
          {empty && trailing === undefined ? <br /> : inner}
          {trailing}
        </p>
      );
    }
    case "bulletList":
      return <ul key={key}>{children(n, depth, photos)}</ul>;
    case "orderedList": {
      const start = isObj(n.attrs) && Number.isInteger(n.attrs.start) ? (n.attrs.start as number) : undefined;
      return (
        <ol key={key} start={start}>
          {children(n, depth, photos)}
        </ol>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children(n, depth, photos)}</blockquote>;
    case "listItem":
      return <li key={key}>{children(n, depth, photos)}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "photo": {
      const caption = isObj(n.attrs) && typeof n.attrs.caption === "string" ? n.attrs.caption : "";
      const url = httpsUrl(isObj(n.attrs) ? n.attrs.url : undefined);
      const index = ++photos.n;
      return (
        <figure key={key} className="space-y-2 whitespace-normal">
          {url ? (
            <FeedPhoto url={url} alt={`Photo ${index} of ${photos.total}`} />
          ) : (
            <div className="aspect-[4/3] w-full rounded-lg bg-muted" role="img" aria-label="Placeholder photo" />
          )}
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

// Grey until the image has loaded, then the photo at the full width of the feed.
function FeedPhoto({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={loaded ? "" : "aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted"}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={loaded ? "w-full rounded-lg" : "h-full w-full object-contain opacity-0"}
      />
    </div>
  );
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
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
    else if (m.type === "strike") out = <s>{out}</s>;
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
