# Implementation plan: written notes hide their author behind a control

Spec: `spec/updates.md` → "Notes" (the author bullet), "Reacting to a note", and "The written note's author".

A written note's card stops showing "— Name" and the time. Its bottom row gets a small round author control (person icon). Hovering it with a mouse floats "Ana Rivera · Oct 17, 2026, 3:04 PM" in the same style as the reactor list; tapping it shows that line under the row until tapped again. The "Family" pill stays on the card, in that row. Video notes don't change.

This changes no data and no permissions: the server already sends the author's name and time to everyone who can see the note, and still does. It's a display change only.

## Steps

1. **Generalize the reactor summary's hover-or-tap behavior** in `src/components/reactions.tsx`. Today `Summary` holds the "hover floats it, tap pins it below" logic, with the open state (`closed | hover | pinned`) owned by `ReactionControls` so the pinned list can sit under the row. Pull that into an exported `Reveal` component that takes the trigger's content, its class and accessible name, the content to float, and the shared state. `Summary` becomes a thin use of it, so the reactor list behaves exactly as before.
2. **Let `ReactionControls` take a `below` slot**, drawn under the row after the pinned reactor list, so a note can put its pinned author line there.
3. **Update `NoteCard`** in `src/components/notes.tsx`:
   - Video note: unchanged (signature with Family pill, then the row with the time and Delete).
   - Written note: no signature line. The row's right side holds the Family pill (family notes only), the author control, and Delete. The author control is a round, outline, 44px tap target with a `UserRound` icon, named for screen readers as "Left by Ana Rivera, Oct 17, 2026, 3:04 PM". It shows the same text floating on hover and pinned under the row on tap.
4. **Format the date once.** Move the existing `toLocaleString(…)` call into a small `noteTime(note)` helper in `src/notes.ts` so the video note's time and the author line match.

## Tests

No automated tests. The change touches no visibility, authentication, or server code. The helper is a single format call, and CLAUDE.md says to check layout by hand. Browser-pane checks instead:

- A written note on the feed and the wall shows no signature or time, and does show the author control. A family member's note also shows its Family pill.
- Keyboard focus and a tap on the control pin the author line under the row. Tapping again hides it. The pane can't trigger CSS or pointer hover reliably, so Melissa checks mouse hover in her own browser.
- The reactor summary still floats on hover and pins on tap, like before.
- A video note looks the same as before.
- At 360px, the note's row wraps without scrolling sideways.

## Cut for speed

- No unit test for `noteTime`.
- Hover is checked only by Melissa, by hand.

## Results

All steps are built. Typecheck and all 343 tests pass locally and in CI. Checked on the PR preview in the browser pane:

- On the wall and the feed, written notes show no signature or time, and each shows an author control named "Left by Name · date".
- Tapping the control pins the author line under the row.
- A family member's written note shows its Family pill beside the control. A test note was posted to check this, then deleted.
- Video notes look the same as before.
- The reactor summary still pins its list.
- At 360px the row fits without scrolling sideways.
- Mouse hover is left for Melissa to check, because the pane doesn't trigger hover.
