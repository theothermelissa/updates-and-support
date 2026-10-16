import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";
import { allowedHref } from "../lib/links.js";
import { Document, Photo } from "./photo.js";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Only what an update allows: paragraphs, line breaks, bold, italic, links, lists, and
// photos. Anything else pasted in keeps its text and loses its formatting.
export const extensions = [
  Document,
  Photo,
  StarterKit.configure({
    document: false,
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      // Pasted addresses arrive as typed ("www.example.com"); the rest as full addresses.
      isAllowedUri: (url) => (HAS_SCHEME.test(url) ? allowedHref(url) : !url.startsWith("/") && allowedHref(`https://${url}`)),
      // Typed and pasted addresses: Tiptap's own check allows any scheme, such as ftp: or file:.
      shouldAutoLink: (url) => (HAS_SCHEME.test(url) ? allowedHref(url) : /\./.test(hostname(url))),
    },
  }),
];

function hostname(url: string): string {
  return (url.split("@").pop() ?? "").split(/[/?#:]/)[0] ?? "";
}

// The document to send: any link the server would refuse is dropped, keeping its text, so
// one stray link can't stop the update from saving.
export function cleanDoc(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node };
  if (node.type === "photo") {
    const attrs = node.attrs ?? {};
    const caption = typeof attrs.caption === "string" ? attrs.caption : "";
    if (attrs.placeholder === true) out.attrs = { caption, placeholder: true };
    else if (typeof attrs.publicId === "string" && attrs.publicId) out.attrs = { caption, publicId: attrs.publicId };
    else out.attrs = { caption };
    delete out.marks;
    return out;
  }
  if (node.marks) {
    out.marks = node.marks.filter((m) => m.type !== "link" || allowedHref(m.attrs?.href));
  }
  if (node.content) out.content = node.content.map(cleanDoc);
  return out;
}
