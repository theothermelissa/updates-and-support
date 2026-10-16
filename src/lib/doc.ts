// The shape of an update's formatted content: a Tiptap document limited to what the app
// allows. server/richText.ts checks every document against it before storing.

export type Mark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };
export type Text = { type: "text"; text: string; marks?: Mark[] };
export type HardBreak = { type: "hardBreak" };
export type Paragraph = { type: "paragraph"; content?: (Text | HardBreak)[] };
export type ListItem = { type: "listItem"; content: Block[] };
export type BulletList = { type: "bulletList"; content: ListItem[] };
export type OrderedList = { type: "orderedList"; attrs: { start: number; type: null }; content: ListItem[] };
export type Block = Paragraph | BulletList | OrderedList;
// A photo sits directly in the document, never in a list. Only placeholders exist so far.
export type Photo = { type: "photo"; attrs: { caption: string; placeholder: true } };
export type Doc = { type: "doc"; content: (Block | Photo)[] };
