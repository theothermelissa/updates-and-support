import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import { BoldIcon, ImagePlusIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allowedHref } from "../lib/links.js";
import { DOC_CLASSES } from "../richText.js";
import { cleanDoc, extensions } from "./extensions.js";
import { MAX_PHOTOS } from "./photo.js";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

// The update editor and its toolbar. Loaded only when a family member writes or edits, so
// supporters never download it. onChange gets the document to send, or null while it's empty.
// photos: what "Add photo" does, or "off" for no button.
export default function RichEditor(props: {
  initial?: unknown;
  photos: "placeholder" | "off";
  onChange: (doc: JSONContent | null) => void;
}) {
  const editor = useEditor({
    extensions,
    content: (props.initial as JSONContent | undefined) ?? "",
    editorProps: {
      attributes: {
        class: `${DOC_CLASSES} min-h-32 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Update",
      },
    },
    onUpdate: ({ editor }) =>
      props.onChange(editor.state.doc.textContent.trim() || photoCount(editor) > 0 ? cleanDoc(editor.getJSON()) : null),
  });

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} photos={props.photos} />
      <EditorContent editor={editor} />
    </div>
  );
}

function photoCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.forEach((node) => {
    if (node.type.name === "photo") count++;
  });
  return count;
}

function Toolbar({ editor, photos }: { editor: Editor; photos: "placeholder" | "off" }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      link: editor.isActive("link"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      photos: photoCount(editor),
    }),
  });
  const picker = useRef<HTMLInputElement>(null);

  // A placeholder uploads nothing: the chosen file is only the cue to add a grey box.
  function addPhoto() {
    editor.chain().focus().insertContent({ type: "photo", attrs: { caption: "", placeholder: true } }).run();
    if (picker.current) picker.current.value = "";
  }
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");

  function openLink() {
    setLinkError("");
    setLink(link === null ? (editor.getAttributes("link").href ?? "") : null);
  }

  // An address with no scheme gets https://, or mailto: if it looks like an email address.
  function applyLink() {
    const typed = (link ?? "").trim();
    if (!typed) return removeLink();
    const href = HAS_SCHEME.test(typed) ? typed : EMAIL.test(typed) ? `mailto:${typed}` : `https://${typed}`;
    if (!allowedHref(href)) {
      setLinkError("That address can't be a link. Use one starting with https://, http://, or mailto:.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    // With nothing selected, the address itself becomes the link's text.
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: typed, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    setLink(null);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLink(null);
  }

  // The field sits inside the post form, so Enter applies the link instead of posting.
  function onLinkKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      setLink(null);
      editor.commands.focus();
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
        <Tool label="Bold" pressed={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon />
        </Tool>
        <Tool label="Italic" pressed={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon />
        </Tool>
        <Tool label="Link" pressed={active.link} expanded={link !== null} onClick={openLink}>
          <LinkIcon />
        </Tool>
        <Tool
          label="Bulleted list"
          pressed={active.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </Tool>
        <Tool
          label="Numbered list"
          pressed={active.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </Tool>
        {photos !== "off" && (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3 [&_svg:not([class*='size-'])]:size-5"
              disabled={active.photos >= MAX_PHOTOS}
              onClick={() => picker.current?.click()}
            >
              <ImagePlusIcon />
              {active.photos >= MAX_PHOTOS ? `${MAX_PHOTOS} photos is the most` : "Add photo"}
            </Button>
            <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.length && addPhoto()} />
          </>
        )}
      </div>
      {link !== null && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-11 min-w-0 flex-1 basis-56"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={onLinkKey}
              placeholder="https://example.com"
              aria-label="Link address"
              aria-invalid={linkError ? true : undefined}
              autoFocus
            />
            <Button type="button" className="h-11" onClick={applyLink}>
              Apply
            </Button>
            {active.link && (
              <Button type="button" variant="outline" className="h-11" onClick={removeLink}>
                Remove link
              </Button>
            )}
          </div>
          {linkError && (
            <p className="text-sm text-destructive" role="alert">
              {linkError}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Tool(props: {
  label: string;
  pressed: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="size-11 aria-pressed:bg-muted aria-pressed:text-foreground [&_svg:not([class*='size-'])]:size-5"
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}
