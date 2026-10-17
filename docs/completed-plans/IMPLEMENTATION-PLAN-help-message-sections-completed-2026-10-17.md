# Implementation plan: the family's message in three parts

Spec: `spec/updates.md` ("The family's message") and `spec/MASTER_SPEC.md`.

The message on How to help becomes an introduction (plain, no box), a "Do:" part, and a "Don't:" part (each in a shaded box). One Edit opens three editors with one Save. Who can see or change the message doesn't change: family members write it (`requireFamilyMember`), everyone signed in to that family reads it.

## Steps

### 1. Storage

- Migration `prisma/migrations/20261025000000_help_message_parts/`: add `Family.helpDo Json?` and `Family.helpDont Json?`. Hand-written SQL.
- The introduction keeps the existing `helpMessage` (plain text) and `helpMessageContent` columns, so every message written so far becomes the introduction with no data change.

### 2. Server (`server/help.ts`)

- `helpMessage(db, person)` returns `{ message: Doc | null; dos: Doc | null; donts: Doc | null }`. `message` is the introduction, as today.
- `setHelpMessage(db, person, input)` takes `{ content?, dos?, donts? }` (plus the legacy `{ message }` text for the introduction). For each part: `undefined` leaves it as it is, `null` removes it, a document is checked by `validDoc` with photos off and the 2,000-character limit. A page loaded before this deploy sends only `{ content }`, so it can't wipe Do and Don't. All parts are checked before anything is written, so one bad part saves nothing. Returns all three.
- `api/f/[slug]/help/index.ts` GET returns `{ message, dos, donts, requests }`; `message` keeps its name so a page loaded before the deploy still shows the introduction.
- `api/f/[slug]/me.ts`: `hasHelpMessage` is true when any part is written.

### 3. Editor placeholder

- Add `@tiptap/extensions` (already installed as a dependency of StarterKit, same version) as a direct dependency for its `Placeholder` extension. This is the dependency to justify in the PR: it's Tiptap's own, already in the bundle, and it's how Tiptap shows hint text.
- `RichEditor` gets an optional `placeholder` prop; when given, the editor adds `Placeholder.configure({ placeholder })`. A rule in `src/index.css` draws the hint in muted text.

### 4. Help page (`src/pages/Help.tsx`)

- `HelpMessage` takes the three parts.
- Reading: the introduction as `RichText` on the page; then "Do:" and "Don't:" as `h3` headings, each over a shaded box with its `RichText`. Empty parts aren't drawn. Family members see Edit at the top right of the message (beside the introduction, or beside the first heading when there's no introduction).
- Editing: three `RichEditor`s (photos off), labeled "Introduction", "Do", and "Don't" for screen readers; the introduction's has the spec's hint text. "Do:" and "Don't:" headings above their editors. One Save sends `{ content, dos, donts }`, each `null` when its editor is empty; Cancel closes all three.

## Tests

- `tests/integration/help.test.ts` (real Postgres):
  - a family member saves all three; everyone in the family reads them; the other family reads all nulls;
  - a part sent as `undefined` stays as it was; `null` removes it; a legacy `{ message }` save leaves Do and Don't untouched;
  - each part refuses over 2,000 characters and photos, and a refusal in one part saves none of them;
  - a supporter can't set any part (existing test extended to `dos`/`donts`); re-prove it fails with `requireFamilyMember` removed;
  - the endpoints: GET sends all three to this family only; `me` reports `hasHelpMessage` when only Do is written.

## Discoveries

- Checked on the preview: the existing message became the introduction unchanged, saving Do and Don't works, and the introduction's empty editor shows its hint (the pane's screenshot lagged; the DOM confirmed it).

## Cuts for speed

- Each editor keeps its own full toolbar, so editing shows three toolbars. A shared toolbar would be tidier but needs focus tracking across editors.
- No hint text in the Do and Don't editors; the headings say what goes there.
