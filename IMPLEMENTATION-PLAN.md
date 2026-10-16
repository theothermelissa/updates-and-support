# Implementation Plan — Shared update action footer

Implements the update footer in `spec/updates.md` → "The feed," "Reactions," and "Leaving a note": React, Leave a note, and (for family members) Edit and Delete sit in one row on every update.

Layout only. Who may react, leave a note, edit, or delete does not change, and those rules stay on the server.

## Design

Every update card has a `CardFooter`. Today only family members see one, with Edit and Delete; React and Leave a note sit in the card body, stacked. After this change the footer is always there:

- **Everyone:** React, the reaction summary when anyone has reacted, and Leave a note, in that order.
- **Family members:** Edit and Delete on the right of the same row.
- **While editing or confirming a delete:** the footer shows only Save / Cancel or the existing inline confirm. React and Leave a note hide for that step.

The row uses `flex-wrap`. On a phone, Edit and Delete drop to the next line rather than shrinking tap targets. The who-reacted list, when pinned, sits under the buttons still inside the footer. The reaction tray still opens upward; the card already allows overflow so it is not clipped.

React and Leave a note stay pills. Edit and Delete stay the outline and ghost buttons they are now.

## Steps

1. **`spec/updates.md`.** The feed, reactions, and leaving-a-note passages describe the shared footer.
2. **`src/pages/Feed.tsx`.** Always render `CardFooter`. Move `Reactions` and Leave a note into it. `Reactions` takes Leave a note as a child so the pinned name list stays under that cluster. Family Edit / Delete sit in a `ml-auto` group on the right. Save / Cancel and the delete confirm replace the whole footer, as they do today.

## Tests

UI layout is verified by hand, not with new automated tests. Existing reaction, note, edit, and delete tests stay as they are; this change does not touch the server.

**Hand check, family member and supporter, desktop and 360px phone:**

- Family: React, Leave a note, Edit, Delete in one footer; Edit / Delete on the right.
- Supporter: the same footer with only React and Leave a note.
- React tray still opens, a reaction still sets, the summary still shows who reacted.
- Leave a note still opens the dialog and saves.
- Edit still becomes Save / Cancel; delete still asks in the footer.
- At 360px the row wraps and the page does not scroll sideways.

## Cut for speed

- No restyling the pills to match Edit / Delete.
- No new component for the footer; `UpdateItem` already owns these buttons.
