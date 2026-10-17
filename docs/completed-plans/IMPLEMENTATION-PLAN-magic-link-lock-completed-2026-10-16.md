# Implementation plan: lock the person row when signing in by magic link

## Goal

Make magic-link sign-in take its turn with removal and promotion, as verify-link sign-in already does, so a removal can never miss a session created in the same instant.

## The problem

`signInWithLink` (`server/auth.ts`) checks the link and its person, spends the link, and inserts a session, with no lock on the person. Removal (`setRemoved` → `endAccess` in `server/people.ts`) marks the person removed, deletes their sessions, then deletes their unused links. If the two overlap, sign-in can spend the link before removal reaches it and insert its session after removal's delete ran. Removal then skips the link, because it's already used, and never sees the session.

`getSession` refuses a removed person's sessions, so the leftover session does nothing at first. But restoring the supporter brings it back to life. The spec says restoring "does not sign them in anywhere" (`spec/access.md`, Managing supporters).

When the person's email isn't verified yet, the overlap can instead deadlock: sign-in's `markVerified` waits for removal's update of the person row, while removal's link delete waits for the link sign-in just spent. Postgres aborts one of them, so a family member's Remove can fail with a server error.

The same race with promotion leaves a session made from a fresh, 15-minute sign-in link sent to the person's own email, which is how family members sign in anyway. The lock also serializes it, so the session gets the person's current role.

## Change

In `signInWithLink`, inside its transaction:

1. Find the usable link with `findUsableLink` to learn the person's id.
2. Lock the person row with `SELECT … FOR UPDATE`, as `signInWithVerifyLink` (`server/gate.ts`) does.
3. Spend the link with `spendLink`, which re-reads the link and person after the lock, so a removal that just committed refuses it.
4. Create the session with the role from the person `spendLink` returned, then mark the email verified, as today.

No spec change: the spec already describes the intended behavior. No schema change.

## Tests

In `tests/integration/auth.test.ts`:

- **"leaves no session when sign-in races removal"**, made deterministic so it fails every time without the lock:
  1. Use a supporter whose email is already verified, so the race takes the leaking path rather than the deadlock.
  2. Give `signInWithLink` a client wrapped with a Prisma query extension that pauses right after `session.create` until the test releases it.
  3. Start the sign-in and wait until it reaches the pause.
  4. Start `setRemoved` and wait with `queuedOrDone(db, removal, "transactionid")` until it's blocked.
  5. Release, await both, and assert the supporter has no session rows. This asserts the cleanup directly, since `getSession` would hide a leftover.

  Without the lock, removal's session delete runs before the sign-in commits and misses the session. With it, removal waits at its update of the person row, and its delete then sees the session.

The test must fail with the lock removed and pass with it.

## Cut for speed

- No test for the promotion race. The outcome there is a legitimate session either way.

## Discoveries

- A plan review found the deadlock, and found that neither a repeated race nor holding the person lock in the test could reproduce the leak: the unfixed sign-in also waits on a test-held person lock, at its session insert's foreign-key check. Pausing sign-in with a Prisma query extension after `session.create` reproduces it every time.
- With the lock removed, the test failed 3 of 3 runs with one session left behind; with it, it passes. Type check and all 338 tests pass.
