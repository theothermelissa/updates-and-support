# Implementation Plan — Live feed

Make the feed stay current without a refresh, as described in `spec/updates.md` → "The feed." The feed polls the existing `GET /api/f/<slug>/updates` endpoint. There is no new endpoint, dependency, or schema change.

## Approach

Why polling: Vercel functions can't hold WebSockets, server-sent events would keep a billed function and a database connection open per tab, and a hosted realtime service would be a new third party that learns when each family is active. Updates are rare, so a check every 30 seconds is enough.

**Who sees what doesn't change.** The server already refuses a removed person's session and the sessions an answer change ends (`tests/integration/people.test.ts`, `gate.test.ts`). Polling only asks the same endpoint more often. Sending a signed-out reader to the gate is a convenience in the page, not the enforcement.

## Steps

1. **Pure logic: `src/liveFeed.ts`.** `applyFetched(shownIds, fetched)` returns `{ visible, waiting }`:
   - `visible` is the fetched updates whose IDs are in `shownIds`, in fetched order. This picks up edits, reactions, and notes, and drops deletions.
   - `waiting` is the number of fetched updates not in `shownIds`. An update that's deleted before the reader presses the button stops counting.
   Plus `newUpdatesLabel(n)`: "1 new update" / "3 new updates".

2. **Polling hook in `Feed.tsx`.** Keep `shownIds` (a ref holding a `Set`) alongside the current `updates` state.
   - `load()`, used on first load and after the reader's own actions, shows everything and sets `shownIds` to all IDs. A family member's own post appears at once.
   - `poll()` fetches, then runs `applyFetched`. A non-200 response shows nothing, except a 401, which calls a new `onSignedOut` prop.
   - A request counter drops any response older than the newest one applied, so a slow poll can't undo a fresher `load()`.
   - A 30-second interval runs only while `document.visibilityState === "visible"`. On `visibilitychange` to visible, it polls immediately and restarts the interval; on hidden, it stops. Clean up on unmount.

3. **"New updates" button.** When `waiting > 0`, show a small pill button that sticks to the top of the screen (`sticky top-2`, centered, above the first update). Pressing it calls `load()` and `window.scrollTo({ top: 0, behavior: "smooth" })`.

4. **`FamilyHome.tsx`.** Pass `onSignedOut={() => setMe("signed-out")}` to `Feed`, which shows the gate.

## Tests

- **Unit (`src/liveFeed.test.ts`):** `applyFetched` keeps only shown updates, with their new content; drops a deleted update; counts new ones; stops counting a new update that is deleted before it's shown. Also the label's singular and plural.
- **No new integration tests.** No server rule changes; the existing tests already cover the 401 for removed people and changed answers.
- **By hand in the browser pane, on a preview:** two sessions, one family member and one supporter.
  - A post shows the pill on the supporter's tab within 30 seconds, and pressing it shows the post.
  - A reaction or note appears in place.
  - A deletion disappears.
  - Hiding the tab stops the polling requests, which you can see in the network log.
  - Removing the supporter sends their tab to the gate.

## Cut for speed

- **The wall doesn't poll.** It's current each time it's opened.
- **Each poll sends the whole feed.** There's no ETag or "changed since" check. Families are small, so the payload is too; revisit if feeds grow long.
- **In-place changes aren't scroll-anchored.** A deleted update, or a note added above the reader's position, can still shift the page slightly. Only new updates are held back.

## Results

- Typecheck, all unit and integration tests, and CI passed.
- Checked by hand against `vercel dev`, using a fictional local family:
  - An update posted from outside the page showed the "1 new update" pill within one check, without moving the page. Pressing it showed the update.
  - Ending the reader's session in the database sent their tab to the gate at the next check.
- Pausing while the tab is hidden wasn't checked by hand, because the browser pane can't hide its tab.
