# Implementation Plan: Managing Supporters

Family members can see their supporters, remove and restore them, and change the community question. Spec: `spec/access.md` → "Managing supporters," "Changing the community question," and the removed-supporter rules in "Joining," "Returning on a new device," and "Signing in." Adding and removing family members is a separate, later plan.

## Design

**One new column.** `Person.removedAt DateTime?`. Null means active. A timestamp rather than a boolean, so the People page can say when, at no extra cost.

**Removal is enforced at every door, not just by deleting sessions.** Deleting sessions and unused links handles the normal case. Each entry point also refuses a removed person on its own, so a missed cleanup or a race (a link spent in the same instant as removal) can't let someone back in:

| Entry point | File | Removed person gets |
| --- | --- | --- |
| `getSession` | `server/auth.ts` | null (not signed in) |
| `requestSignInLink` | `server/auth.ts` | nothing sent; caller still says "Check your email" |
| `spendLink` (sign-in and verify links) | `server/auth.ts` | refused, logged as "person removed" |
| `join` | `server/gate.ts` | 403 "This email can't join this family's updates. Please contact the family.", checked before any link is sent |
| `notifySupporters` | `server/notifications.ts` | no email |
| `unverifiedSupporters` | `server/notifications.ts` | excluded from `verification:send` |

**`server/people.ts`** holds the new rules as plain functions, each taking the signed-in `Person`:

- `listPeople(db, person)` → `{ supporters, removed, question, acceptedAnswers }`. Supporters sorted by join date, newest first. Each row: id, name, email, emailVerified, notificationsOn, joinedAt (and removedAt for removed).
- `removeSupporter(db, person, id)`: in one transaction, a conditional `updateMany` scoped to `{ id, familyId: person.familyId, role: "supporter" }` sets `removedAt` and `notificationsOn: false`, then deletes that person's sessions and unused magic links. A miss is a 404, so another family's IDs and family members' IDs look like nonexistent ones. Removing someone already removed succeeds and re-stamps `removedAt` with the new time; this only happens on a double click, and avoiding it would need a special case.
- `restoreSupporter(db, person, id)`: same scoping; clears `removedAt` and writes nothing else. `notificationsOn` is already false from removal, and a removed person has no way to turn it back on.
- `changeQuestion(db, person, { question, answers })`: trims; question 1–500 characters; answers is an array of strings, trimmed, blanks dropped, at least one left, each ≤ 200 characters, at most 50. 400 otherwise.
- All four require `person.role === "family"` (403 otherwise). `requireFamilyMember` moves here from `server/updates.ts`, with the generic message "Only family members can do this," and both files share it.
- Input is checked in `server/people.ts`: an `id` that isn't a non-empty string, or an unknown `action`, is a 400, never a 500 from Prisma.

**One endpoint, `api/f/[slug]/people.ts`.** `GET` lists. `POST` takes `{ action: "remove" | "restore", id }` or `{ action: "question", question, answers }`. Why one file instead of three: the project has 11 functions, and Vercel's Hobby plan has historically capped deployments at 12; this makes 12. One dispatcher costs a few lines; hitting the cap would block a deploy.

**UI.** `src/pages/People.tsx` at `/f/<slug>/people`, routed in `src/App.tsx`, linked from the feed header for family members only. Two tables (supporters, removed), a Remove button with `window.confirm`, a Restore button, and a form with the question and a textarea of answers, one per line. A supporter or visitor who opens the URL gets what the server allows: the page shows "Only family members can see this page," and the server returns no data.

## Steps

1. **Schema.** Add `removedAt`, create the migration, regenerate the client.
2. **Removal at every door.** Apply the table above in `auth.ts`, `gate.ts`, and `notifications.ts`.
3. **`server/people.ts`.** The four functions, with `requireFamilyMember` moved in.
4. **Integration tests** (below). Prove each access test can fail by removing its rule.
5. **Endpoint** `api/f/[slug]/people.ts`.
6. **UI.** People page, route, feed link. Verify in the browser.
7. **Ship.** Typecheck, tests, PR, preview check, merge on Melissa's OK.

## Tests

All integration tests against Postgres in `tests/integration/people.test.ts`, except where noted.

**Who may see and change**
- A family member gets their own family's supporters, and never another family's.
- A supporter gets 403 on list, remove, restore, and question change.
- A family member of family A cannot remove, restore, or see a supporter of family B (404).
- Remove and restore by a family member's ID is a 404; family members can't be removed this way.

**Removal**
- Ends the supporter's existing sessions: `getSession` returns null.
- A sign-in link sent before removal no longer signs them in (through `removeSupporter`).
- `signInWithLink` and `verifyEmail` refuse a removed person whose link still exists: set `removedAt` directly, leave the link in place. This tests the per-door check separately from cleanup.
- `requestSignInLink` sends nothing to a removed supporter.
- Joining with a removed email is refused with the spec's message, sends no email, and creates no person, session, or magic link.
- A removed supporter gets no notification (extends `notifications.test.ts`). The test sets `removedAt` directly and leaves `notificationsOn: true`; removing through `removeSupporter` would turn notifications off and leave the new filter untested.
- `getSession` refuses a removed person even if a session row survived (insert one directly), so the per-door check is tested separately from cleanup.

**Restore**
- A restored supporter can request a link and sign in again.
- Their notifications are off after restore, and restoring creates no session.

**Question**
- After a change, the old answer is wrong and a new one is correct; existing sessions still work.
- An empty question or no non-blank answers is a 400 and changes nothing.
- A non-string `id` or unknown `action` is a 400.

## Cut for speed

- No record of which family member removed whom, and no email to the removed person.
- No search, sorting, or pagination on the People page. Families have tens of supporters, not thousands.
- `window.confirm` for removal instead of a styled dialog.
- Changing a supporter's name or email: not in the spec, not built.
