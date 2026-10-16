import { Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";

export const MAX_PHOTOS = 6;
const MAX_CAPTION = 300;

// The document, allowing photos only at the top level, never inside a list.
export const Document = Node.create({ name: "doc", topNode: true, content: "(block | photo)+" });

// A photo with an optional caption. It has no rule for reading HTML, so pasting can never
// create one; only "Add photo" can.
export const Photo = Node.create({
  name: "photo",
  atom: true,
  draggable: false,
  addAttributes() {
    return { caption: { default: "", rendered: false }, placeholder: { default: true, rendered: false } };
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

function PhotoCard({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper as="figure" className="space-y-2 whitespace-normal">
      <div className="aspect-[4/3] w-full rounded-lg bg-muted" role="img" aria-label="Placeholder photo" />
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-11 min-w-0 flex-1 basis-56"
          value={node.attrs.caption as string}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          placeholder="Caption (optional)"
          aria-label="Photo caption"
          maxLength={MAX_CAPTION}
        />
        <Button type="button" variant="outline" className="h-11" onClick={deleteNode}>
          Remove
        </Button>
      </div>
    </NodeViewWrapper>
  );
}
