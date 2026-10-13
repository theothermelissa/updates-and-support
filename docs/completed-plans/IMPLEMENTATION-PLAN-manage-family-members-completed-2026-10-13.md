# Implementation Plan: Adding and Removing Family Members

Family members can add other family members (promoting a supporter or restoring a removed person when the email is already in the family) and remove other family members, never leaving the family with none. Spec: `spec/access.md` → "Adding family members," "Removing family members," and "Managing supporters" (the People page).

## Design

No schema change. `Person.role` and `Person.removedAt` already cover every state.

### `server/people.ts`

**`listPeople`** also returns `familyMembers`: active family members, oldest first, each `{ id, name, email, isYou }`. `isYou` lets the page hide the Remove button on the viewer's own row. Removed family members aren't listed.

**`addFamilyMember(db, send, person, { name, email })`**
- Requires a family member. Validates the name (1–100 characters) and the email (`isValidEmail` after `normalizeEmail`), using the same rules and messages as joining. `validJoiner` moves from `server/gate.ts` to `server/families.ts` as `validNameAndEmail` so both callers share it.
- In one transaction, looks up `(familyId, email)`:
  - **None:** create a family member.
  - **Active family member:** throw 409 "That person is already a family member." Nothing is sent.
  - **Supporter, or removed family member:** update to `{ role: "family", name, removedAt: null }` and delete their sessions. Deleting sessions on promotion is the point: a supporter session lasts 180 days. For a removed family member, the sessions are already gone.
  - In every case that changes something, also create a sign-in link (see below).
- A concurrent create of the same email hits the `(familyId, email)` unique constraint. Catch that P2002 around the whole `$transaction` call, not inside it, because the error aborts the Postgres transaction. Turn it into the same 409.
- Returns `{ name, outcome: "added" | "promoted" | "restored" }`. The page uses it to say "Moved {name} from supporters to family members" rather than leaving a supporter to vanish silently from the table.
- After the transaction, send the "added" email. A send failure is logged, and the add still succeeds, as joining does.

**Sign-in link creation is shared.** `server/auth.ts` gains `newSignInLink()`, returning `{ token, data }` like `newVerificationLink()`, and `signInLinkUrl(slug, token)`. `requestSignInLink` uses both, so the two emails can't drift apart in link format or lifetime. The added email goes out without counting against the 5-per-hour limit. That limit stops the sign-in form from flooding an inbox, and adding requires a family member's session.

**Session lifetime follows the current role.** `getSession` also refuses a session older than `SESSION_LIFETIME[person.role]` from its `createdAt`. Without this, a supporter who signs in at the same instant they're promoted could get a 180-day session that acts as a family member, since the role is read live. With it, a family member's session never outlives 30 days, however it was created. This is one line.

**`addedEmail(to, familyName, link, signInPage)`** in `server/email.ts`: "You've been added to {family}'s updates as a family member. Sign in here: {link}. The link works once and expires in 15 minutes. After that, sign in any time at {site}/f/{slug}/family." Like every email, it names the family and carries links, with no update content.

**`setRemoved`** handles both roles and returns nothing; the page already reloads the list afterwards. It first loads the target, scoped by `{ id, familyId }`; a miss is a 404.
- **Supporter:** as before.
- **Family member:** only `removed: true` is accepted (restoring is done by adding again, so `false` → 400). Removing yourself → 400 "You can't remove yourself." Otherwise, in one transaction:
  1. Lock the family's row (`SELECT 1 FROM "Family" WHERE id = … FOR UPDATE`). This serializes family-member removals within one family, without needing an advisory-lock key.
  2. Re-check that the **actor** is still an active family member; if not → 403. Self-removal is blocked, so an active actor always remains, and the family can never reach zero. The same check stops a just-removed member's in-flight request from removing someone else.
  3. Mark removed, delete sessions and unused links, the same as for supporters.
- Every update branch keeps `role` in its `where`. If the target is promoted between the load and the update, the stale branch then misses and returns a 404, rather than acting on the wrong role.

### Endpoints

- `POST api/f/[slug]/people` with `{ name, email }` adds a family member. `GET` on the same file is unchanged.
- `PATCH api/f/[slug]/people/[id]` is unchanged; `setRemoved` now dispatches on the target's role.

### UI (`src/pages/People.tsx`)

A "Family members" section above Supporters: a small table (name, email, Remove with the same inline confirmation, hidden on your own row), then an "Add a family member" form with name and email.

Adding asks inline first: "Add {name} ({email}) as a family member? They'll be able to post, edit, and delete updates and see all supporters." A mistyped email would hand family access to whoever owns that address, so the address is shown back before anything is sent. Afterwards the page shows "Added {name}. They'll get an email to sign in.", "Moved {name} from supporters to family members.", or the server's error.

## Steps

1. Shared helpers: `validNameAndEmail`, `newSignInLink` and `signInLinkUrl`, and `addedEmail`.
2. `listPeople` family members, `addFamilyMember`, and `setRemoved` for family members.
3. Integration tests (below). Prove each access test can fail by removing its rule.
4. Endpoint: `POST` on `people/index.ts`.
5. UI. Verify in the browser locally, including at phone width.
6. Ship: typecheck, tests, PR, preview, and merge on Melissa's OK.

## Tests

Integration tests in `tests/integration/people.test.ts`.

**Adding**
- A new email creates a family member and emails a sign-in link that signs them in as a family member.
- A supporter's email promotes the same record: the role is family, the name is the new one, their old session no longer works, and the emailed link gives a family session.
- A removed supporter's email promotes and restores them.
- A removed family member's email restores them.
- An active family member's email is a 409 that sends nothing and changes nothing.
- A supporter can't add (403). Adding uses the signed-in person's family: a family member of family A adding an email that belongs to family B's supporter creates a new person in A and leaves B's record untouched.
- An invalid name or email is a 400.
- A failing mailer still adds the person.

**Existing tests that change:** "treats another family's supporter, or a family member, as not found" drops its family-member cases, which become the removal tests below. "lets them sign in by email again…" reads the restored supporter from the database, since `setRemoved` no longer returns a view.

**Removing**
- Removing another family member ends their sessions and links; their updates remain, with their name.
- Removing yourself is a 400. With two family members, A can remove B, leaving A.
- **A removed family member's stale request can't remove anyone.** Family with A and B: A removes B, then `setRemoved` called with B's old `Person` object on A is a 403, and A stays active. This is the deterministic test for "never zero family members"; it fails if the actor re-check is deleted.
- **Mutual removal at the same moment leaves exactly one family member.** `Promise.all` of A removing B and B removing A: one succeeds, one is refused. This exercises the lock, but timing can let it pass without it, so it isn't the proof; the stale-actor test above is.
- A session older than 30 days is refused once its person is a family member, even if created as a supporter's (insert one directly with an old `createdAt`).
- `removed: false` on a family member is a 400.
- A removed family member can't sign in by email or join as a supporter. The per-entry-point checks already cover this; one test confirms them for the family role.

## Cut for speed

- No rate limit on adding family members. A family member can trigger emails to any address, but needs a family session to do it.
- No "Removed family members" list. Adding the email again restores them.
- Demoting a family member to supporter, and leaving a family yourself, aren't built.
- The "added" email doesn't say who added them.
- Renaming on promote or restore relabels that person's earlier updates, since author names are read live. That's acceptable; it's the same person.
- Promoted supporters stop getting notification emails, as family members never get them.

## Progress and discoveries

Steps 1–5 are done. Each new rule was removed in turn to confirm its test fails. Two passed at first: family-member removal's cleanup, which the per-entry-point removed checks masked, so the test now asserts directly that no sessions or unused links remain; and the row lock, which a single concurrent race can satisfy by timing alone. The race test now repeats 20 times. Without the lock it failed 3 of 3 runs, and with the lock it passed 3 of 3.

Verified by hand on the local Test Family: add with inline confirmation, the "added" email in the server log, the 409 for an existing family member, removal with inline confirmation, and no sideways scrolling at phone width.
