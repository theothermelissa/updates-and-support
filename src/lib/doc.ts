// The shape of an update's formatted content: a Tiptap document limited to what the app
// allows. server/richText.ts checks every document against it before storing.

export type Mark = { type: "bold" } | { type: "italic" } | { type: "strike" } | { type: "link"; attrs: { href: string } };
export type Text = { type: "text"; text: string; marks?: Mark[] };
export type HardBreak = { type: "hardBreak" };
export type Paragraph = { type: "paragraph"; content?: (Text | HardBreak)[] };
export type ListItem = { type: "listItem"; content: Block[] };
export type BulletList = { type: "bulletList"; content: ListItem[] };
export type OrderedList = { type: "orderedList"; attrs: { start: number; type: null }; content: ListItem[] };
export type Blockquote = { type: "blockquote"; content: Block[] };
export type Block = Paragraph | BulletList | OrderedList | Blockquote;
// A photo sits directly in the document, never in a list or quote. A placeholder has no file. A real
// photo names the Cloudinary id the server issued. The feed adds url; it is never stored.
export type Photo =
  | { type: "photo"; attrs: { caption: string; placeholder: true; url?: string | null } }
  | { type: "photo"; attrs: { caption: string; publicId: string; url?: string | null } };
export type Doc = { type: "doc"; content: (Block | Photo)[] };
