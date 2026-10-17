# Implementation Plan: Formatted request descriptions

Spec: [spec/updates.md → How to help](spec/updates.md#how-to-help), and the MVP and "Content is never inserted as HTML" lines in [spec/MASTER_SPEC.md](spec/MASTER_SPEC.md).

A way to help gets a formatted description written with the update editor (no photos), stored the way the family's introduction already is: a checked document beside its plain text.

## Steps

1. **Migration** `prisma/migrations/20261027000000_help_request_content/`: `ALTER TABLE "HelpRequest" ADD COLUMN "content" JSONB;` and `content Json?` in `schema.prisma`. No backfill: requests without content are converted from `body` when shown.

2. **Server (`server/help.ts`, `server/richText.ts`)**
   - `DocLimits.noun` gains `"request"`, so errors read "A request can have at most 2,000 characters" and "Request can't be empty".
   - `validRequest` takes `content` (checked by `validDoc` with photos off and a 2,000-character limit) and stores `body = textOf(content)` beside it. A page loaded before the deploy sends `{ body }` as plain text; that becomes `docFromText(body.trim())`, as the family's introduction already does. Neither one is a 400.
   - `HelpRequestView` gains `content: Doc`, from `shownContent(request.content, request.body)`, so a request written before formatting, or edited by older code that changed only `body`, shows as its text. `body` stays in the view so pages loaded before the deploy keep working.

3. **`RichText` (`src/richText.tsx`)**: an optional `trailing` node. When the document's last top-level block is a paragraph, it's drawn at the end of that paragraph; otherwise it's drawn in its own paragraph after the document. Request cards pass the count here.

4. **Help page (`src/pages/Help.tsx`)**
   - `RequestCard` shows `<RichText doc={request.content} trailing={count} />`. Covered and past requests keep `line-through` on the container. The count stays `inline-block`, so the line skips it, as today.
   - `RequestForm` replaces the textarea with the lazy `RichEditor` (`photos="off"`, label "What would help"), in the same `Suspense` fallback the message uses. It sends `content`. **Add request** / **Save** is disabled while the editor is empty. After a successful add, the editor is cleared by remounting it with a new `key`.
   - `LinkedText` stays in use by notes.

## Tests

Integration tests in `tests/integration/help.test.ts`:
- Adding and editing with `content` stores the checked document and its plain text, and the view returns that document.
- A description that's too long (2,001 characters), has a photo, has unsupported formatting, or is empty is refused with a 400, and nothing is stored or changed.
- `{ body }` from an old page is still accepted, and a stored request with no `content` shows `docFromText(body)`.
- The existing tests keep using `body` (the old-page path); the access tests (supporter refused, other family 404) stay as they are and also run with `content`.

No access rule changes, so there's no subagent review and no rule-removal step. Visibility of request text is unchanged.

Unit: a `RichText` test that `trailing` lands inside a final paragraph, and after a final list.

Browser check: add a request with bold, a link, and a list; edit it; confirm the count's position in both layouts and the strikethrough on a covered request.

## Cut for speed

- The extra toolbar: editing the family's message while the add form is open shows four editors. That stays in the backlog as "Tidy the How to Help message editor."
- No character counter. An overlong description fails on Save with the server's message, as the family's message does today.

## Results

- `npm run typecheck` and `npm test` pass (378 tests), including the new integration tests and the `RichText` trailing test.
- On the preview: a request added with the editor saves, and the editor clears afterward. Editing loads the saved content, and toolbar bold and bullet list save. The count ends a final paragraph, and goes on its own line after a final list. Requests written before this change show as before.
- The browser pane's typing doesn't trigger Tiptap's markdown shortcuts (`**bold**`, `- `), so those were checked with the toolbar instead. A real keyboard triggers them.
- Editing the count's spacing showed that Tiptap often leaves an empty paragraph after a final list, and the count landed in it on a blank line. With a count, `RichText` now drops empty paragraphs at the end, and a count after a list or quote is pulled up to sit just under it.
- `main` gained resolving requests while this was open, with a migration of the same timestamp (`20261027000000_help_request_resolved`). The names differ, so both apply; this one kept its name because the preview had already applied it.
