import { Extension, type Editor } from "@tiptap/react";
import type { ResolvedPos } from "@tiptap/pm/model";

// Quote turns on for the line the cursor is on, not its whole paragraph. A paragraph can hold
// several lines joined by line breaks (text from before formatting, or Shift+Enter), so the
// line is first split out at the line breaks around it. Turning a quote off is unchanged.
export function toggleQuote(editor: Editor): boolean {
  if (!editor.isActive("blockquote")) {
    const { tr, selection } = editor.state;
    // The later break first, so the earlier one's position still holds.
    for (const pos of [breakAt(selection.$to, "after"), breakAt(selection.$from, "before")]) {
      if (pos === null) continue;
      tr.delete(pos, pos + 1);
      tr.split(pos);
    }
    if (tr.docChanged) editor.view.dispatch(tr);
  }
  return editor.chain().focus().toggleBlockquote().run();
}

// The position of the nearest line break before or after $pos in its paragraph, or null.
function breakAt($pos: ResolvedPos, side: "before" | "after"): number | null {
  if ($pos.parent.type.name !== "paragraph") return null;
  let found: number | null = null;
  $pos.parent.forEach((child, offset) => {
    if (child.type.name !== "hardBreak") return;
    const pos = $pos.start() + offset;
    if (side === "before" && pos < $pos.pos) found = pos;
    if (side === "after" && pos >= $pos.pos && found === null) found = pos;
  });
  return found;
}

// The keyboard shortcut quotes the line too. It runs ahead of StarterKit's own.
export const Quote = Extension.create({
  name: "quoteLine",
  priority: 1000,
  addKeyboardShortcuts() {
    return { "Mod-Shift-b": () => toggleQuote(this.editor as Editor) };
  },
});
