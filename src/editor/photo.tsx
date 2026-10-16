import { Node, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type ReactNodeViewProps } from "@tiptap/react";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";

export const MAX_PHOTOS = 6;
const MAX_CAPTION = 300;

// The document, allowing photos only at the top level, never inside a list.
export const Document = Node.create({ name: "doc", topNode: true, content: "(block | photo)+" });

// A photo with an optional caption. It has no rule for reading HTML, so pasting can never
// create one; only "Add photo" can. preview, uploading, error, and clientId stay in the
// editor; cleanDoc strips them before a save.
export const Photo = Node.create({
  name: "photo",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      caption: { default: "", rendered: false },
      placeholder: { default: null, rendered: false },
      publicId: { default: null, rendered: false },
      url: { default: null, rendered: false },
      clientId: { default: null, rendered: false },
      preview: { default: null, rendered: false },
      uploading: { default: null, rendered: false },
      error: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML() {
    return ["figure"];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PhotoCard);
  },
});

// Points an upload's result at the card that started it. No match means the card was removed.
export function setPhotoAttrs(editor: Editor, clientId: string, attrs: Record<string, unknown>) {
  editor.commands.command(({ tr, state }) => {
    let found = false;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "photo" && node.attrs.clientId === clientId) {
        found = true;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      }
    });
    return found;
  });
}

function PhotoCard({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
  const placeholder = node.attrs.placeholder === true;
  const preview = typeof node.attrs.preview === "string" ? node.attrs.preview : "";
  const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
  const uploading = node.attrs.uploading === true;
  const error = typeof node.attrs.error === "string" ? node.attrs.error : "";
  const src = preview || (url.startsWith("https://") ? url : "");

  function remove() {
    if (preview) URL.revokeObjectURL(preview);
    deleteNode();
  }

  return (
    <NodeViewWrapper as="figure" className="space-y-2 whitespace-normal">
      <div className="group relative">
        {placeholder || !src ? (
          <div className="aspect-[4/3] w-full rounded-lg bg-muted" role="img" aria-label="Placeholder photo" />
        ) : (
          <EditorPhoto src={src} uploading={uploading} />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="editor-photo-remove absolute top-2 right-2 size-11 transition-opacity duration-100 ease-out"
          onClick={remove}
          aria-label="Remove photo"
        >
          <XIcon />
        </Button>
      </div>
      {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Input
        className="h-11"
        value={caption}
        onChange={(e) => updateAttributes({ caption: e.target.value })}
        placeholder="Caption (optional)"
        aria-label="Photo caption"
        maxLength={MAX_CAPTION}
      />
    </NodeViewWrapper>
  );
}

// A local preview while a new photo uploads, or the signed photo while an update is edited.
// The grey box shows until a signed photo has loaded.
function EditorPhoto({ src, uploading }: { src: string; uploading: boolean }) {
  const [loaded, setLoaded] = useState(uploading);
  const show = uploading || loaded;
  return (
    <div className={show ? "" : "aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted"}>
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={show ? "w-full rounded-lg bg-muted" : "h-full w-full object-contain opacity-0"}
      />
    </div>
  );
}
