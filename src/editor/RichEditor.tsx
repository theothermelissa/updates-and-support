import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import { BoldIcon, ImagePlusIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, StrikethroughIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allowedHref } from "../lib/links.js";
import { DOC_CLASSES } from "../richText.js";
import { photoSizeMessage, uploadPhoto } from "../photos.js";
import { cleanDoc, extensions } from "./extensions.js";
import { MAX_PHOTOS, setPhotoAttrs } from "./photo.js";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

// The update editor and its toolbar. Loaded only when a family member writes or edits, so
// supporters never download it. onChange gets the document to send, or null while it's empty.
// photos: what "Add photo" does. "real" uploads the file; "placeholder" draws a grey box;
// "off" hides the button. Saving waits until every real photo has finished uploading.
export default function RichEditor(props: {
  initial?: unknown;
  photos: "real" | "placeholder" | "off";
  slug: string;
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
    onUpdate: ({ editor }) => props.onChange(docToSend(editor)),
  });

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} photos={props.photos} slug={props.slug} />
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

// Null while a photo is still uploading or failed, so Post and Save stay disabled.
function docToSend(editor: Editor): JSONContent | null {
  let pending = false;
  editor.state.doc.forEach((node) => {
    if (node.type.name !== "photo") return;
    const { placeholder, publicId, uploading, error } = node.attrs;
    if (placeholder === true) return;
    if (uploading || error || typeof publicId !== "string" || !publicId) pending = true;
  });
  if (pending) return null;
  if (!editor.state.doc.textContent.trim() && photoCount(editor) === 0) return null;
  return cleanDoc(editor.getJSON());
}

function Toolbar({ editor, photos, slug }: { editor: Editor; photos: "real" | "placeholder" | "off"; slug: string }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      link: editor.isActive("link"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      photos: photoCount(editor),
    }),
  });
  const picker = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  // A placeholder uploads nothing: the chosen file is only the cue to add a grey box.
  // A real photo uploads immediately and the card shows the local preview until it's done.
  async function addPhoto(file: File) {
    if (photos !== "real") {
      editor.chain().focus().insertContent({ type: "photo", attrs: { caption: "", placeholder: true } }).run();
      return;
    }
    const tooBig = photoSizeMessage(file);
    if (tooBig) {
      setPhotoError(tooBig);
      return;
    }
    setPhotoError("");
    const clientId = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    editor.chain().focus().insertContent({ type: "photo", attrs: { caption: "", clientId, preview, uploading: true } }).run();
    try {
      const publicId = await uploadPhoto(slug, file);
      setPhotoAttrs(editor, clientId, { publicId, uploading: false, error: null });
    } catch (err) {
      setPhotoAttrs(editor, clientId, {
        uploading: false,
        error: err instanceof Error ? err.message : "The photo didn't upload. Please try again.",
      });
    }
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
        <Tool label="Strikethrough" pressed={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <StrikethroughIcon />
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
            <input
              ref={picker}
              type="file"
              accept="image/*,.heic,.heif"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addPhoto(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {photoError && (
        <p className="text-sm text-destructive" role="alert">
          {photoError}
        </p>
      )}
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
