# Implementation Plan — Rename a family

Implements, in `spec/access.md`:
- **Families:** what the display name is used for, and renaming a family.
- **Stated limits:** a slug without the random suffix can be guessed.

It also brings in the operator lines in `spec/MASTER_SPEC.md`. One small PR, no schema change.

The first use renames the Stone family to "Ginger's Updates" at `/f/for-ginger`. Melissa decided:
- **Address:** `for-ginger`, with no random suffix.
- **Old address:** it can break; no one relies on it.
- **Name:** the new display name heads the site and appears in emails and the browser tab, with the email wording updated to read naturally.

## Steps

1. **`server/families.ts`**
   - `isValidSlug(slug)`: words of lowercase letters and numbers joined by single hyphens, 3 to 60 characters.
   - `renameFamily(db, currentSlug, { displayName, slug })`:
     - Finds the family by its current slug.
     - Trims and checks the display name (1 to 100 characters) and the new slug.
     - Updates both.
     - If another family has the slug (`P2002`), it refuses with "That address belongs to another family." and changes nothing.
2. **`scripts/rename-family.ts` and `npm run family:rename`**, in the style of `family:create`:
   - Prompts for the current address, the new display name, and the new address. Enter keeps the current value.
   - Shows the change and warns that the old address stops working and everyone signs in again.
   - Asks yes/no, then prints the production address.
3. **`server/email.ts`:** reword so a display name like "Ginger's Updates" reads naturally, and "The Rivera Family" still does.
   - **Sign-in:** "Use this link to sign in to Ginger's Updates".
   - **Added family member:** subject "You've been added to Ginger's Updates", body "…as a family member."
   - **Welcome (supporter added):** "You've been added to Ginger's Updates. Please confirm your email to get an email when there's a new update".
   - **Verification:** subject "Confirm your email for Ginger's Updates", body "…when Ginger's Updates has a new update".
   - **Notification:** "Ginger's Updates has a new update", in both the subject and the body.
4. **`src/App.tsx`:** on a family's pages, set the browser tab's title to the display name from `GET gate`, which already shows it to anyone at the address. Other pages keep "Updates and Support".
5. **`scripts/create-family.ts`:** the display-name prompt's example shows both styles.
6. **README:** add `npm run family:rename` to the commands table, and "Renaming a family in production" under Deployment.

## Tests

- **Unit:** `isValidSlug` accepts `for-ginger` and `rivera-k3f9m2xq`, and refuses capitals, spaces, leading, trailing, or doubled hyphens, and slugs that are too short or too long.
- **Integration (`families` access):**
  - Renaming changes the name and address.
  - The old slug no longer finds the family.
  - Another family's slug, an invalid slug, an empty name, or an unknown current address is refused, and nothing changes.
- **Existing assertions:** the email-subject checks in `people.test.ts` and `notifications.test.ts` change to the new wording.
- **By hand:** the tab title in the browser.

## Running it in production

After merging, Melissa copies the production connection string from Neon and runs the command without pasting the string anywhere:

```
DATABASE_URL="$(pbpaste)" npm run family:rename
```

At the prompts she enters the current address (`stone-…`), "Ginger's Updates", and `for-ginger`. The family member then signs in again at `/f/for-ginger` with Family sign-in.

## Cut for speed

- **No redirect from the old address,** by decision.
- **Notification emails already sent** keep linking to the old address.

## Progress and discoveries

All steps are implemented. `npm run typecheck`, `npm test` (113 tests), and `npm run build` pass.

**Proving the tests can fail.** A test caught each of these when it was removed in turn:
- the address check;
- the display-name check;
- the taken-address message;
- updating the address at all.

**By hand:**
- **The script,** against a local database with piped answers:
  - declining changes nothing;
  - confirming renames the family and prints the production address;
  - an unknown address exits with an error.
- **In Chromium:** the renamed family's gate and feed show "Ginger's Updates" as both the heading and the tab title, and the old address shows "not found" with the default tab title.
- **Email:** the verification email reads "Confirm your email for Ginger's Updates" and links to the new address.
