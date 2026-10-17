# Implementation plan: block quotes, and a formatted How to Help message

Spec: `spec/updates.md` ("An update," "Writing an update," "The family's message") and `spec/MASTER_SPEC.md`.

Two pieces in one PR, because the message reuses the update editor and the quote ships in both:

1. Block quotes join the update format: editor, toolbar, server validator, renderer, plain text.
2. The family's message on How to help becomes a document written with the update editor, without photos.

Who can see or change the message does not change: family members write it, everyone signed in reads it, enforced by the existing `requireFamilyMember` and family-scoped reads in `server/help.ts`.

## Steps

### 1. Block quotes in the format

- `src/lib/doc.ts`: add `Blockquote = { type: "blockquote"; content: Block[] }` to `Block`. A quote holds paragraphs, lists, and quotes; never photos (photos are top level only, as today).
- `server/richText.ts`:
  - `block()` accepts `blockquote` with no attrs and at least one child block. Depth and node limits already cover nesting.
  - `blocksText()` writes a quote as its inner text with each line prefixed by `> ` (blank lines as `>`), indented like other nested blocks.
- `src/editor/extensions.ts`: stop disabling `blockquote` in StarterKit; update the comment. This also enables Tiptap's `> ` input rule and Ctrl/⌘+Shift+B.
- `src/editor/RichEditor.tsx`: a **Quote** toolbar button (lucide `TextQuoteIcon`) after Numbered list, with its pressed state.
- `src/richText.tsx`: render `blockquote` as `<blockquote>`. `DOC_CLASSES` gains a 4px left border at `foreground/20` (visible on white and on the message's grey box), left padding, muted text, and a line of space between the quote's own children.

### 2. The message as a document

- Migration `prisma/migrations/<after 20261023000000>_help_message_content/`: add `Family.helpMessageContent Json?`. Hand-written SQL, per `claude/lessons.md`.
- `server/richText.ts`: `validDoc` takes an optional `{ maxText, noun }` so the message gets a 2,000-character limit and errors that say "message" rather than "update." Updates keep today's defaults.
- `server/help.ts`:
  - `setHelpMessage(db, person, input)` accepts `{ content }` (a document, or `null` to remove), and still `{ message }` as plain text from pages loaded before this deploy, converted with `docFromText`. The document goes through `validDoc` with photos off and the 2,000 limit. Stores `helpMessageContent` and `helpMessage = textOf(content)`, or both null. Returns `{ message: Doc | null }`.
  - `helpMessage(db, person)` returns `Doc | null`: null when `helpMessage` is null, else `shownContent(helpMessageContent, helpMessage)`, which already falls back to `docFromText` for messages written before formatting.
  - The nav's "has a message" check keeps using the `helpMessage` text column, unchanged.
- `src/editor/RichEditor.tsx`: an optional `label` prop for the editor's `aria-label` (default "Update"; the message uses "Message for supporters").
- `src/pages/Help.tsx`: `HelpMessage` holds a `Doc | null`; renders it with `RichText`; edits with a lazily loaded `RichEditor` (`photos="off"`, `initial` = current message), so supporters never download the editor. Save sends `{ content }`; an empty editor sends `null`, which removes the message.

## Tests

- `server/richText.test.ts` (unit): a quote with paragraphs and a list is accepted and round-trips; a photo inside a quote is refused; `textOf` for a quote and a quote in a list; `validDoc` with `{ maxText: 2000, noun: "message" }` refuses 2,001 characters with the message wording.
- `src/editor/extensions.test.ts`: pasted `<blockquote>` is now kept as a quote, and the server accepts it.
- `tests/integration/help.test.ts` (real Postgres):
  - a family member saves a formatted message; every person in that family reads the same document, and the other family reads null (existing isolation check, now on documents);
  - `{ content: null }` removes it; a legacy `{ message: "text" }` still saves as a document;
  - a photo in the message is refused; over 2,000 characters is refused;
  - a supporter can't set the message (existing test, kept). Re-prove it fails with `requireFamilyMember` removed, since the function body changes.

## Discoveries

- Messages from before formatting, and lines typed with Shift+Enter, are one paragraph joined by line breaks, so Tiptap's quote took in the whole message. `src/editor/quote.ts` splits the cursor's line out at the surrounding line breaks before quoting, for the toolbar button and ⌘⇧B.
- Tiptap keeps an empty paragraph after a quote at the end of a document, so there's somewhere to type below it.

## Cuts for speed

- No live character counter in the message editor. Going over 2,000 characters shows the server's error on Save.
- Quote nesting isn't limited separately; the validator's existing depth limit (10) caps it.
