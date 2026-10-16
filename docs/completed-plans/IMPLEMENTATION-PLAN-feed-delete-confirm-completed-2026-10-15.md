# Implementation Plan — Confirm deleting an update on the page

Implements, in `spec/updates.md`: "A family member can delete any update in their family after confirming." The spec needs no change.

## Change

The feed's Delete button asks for confirmation inline instead of with `confirm()`. Pressing Delete shows "Delete this update? This can't be undone." with "Yes, delete" and "Cancel" buttons below the update's Edit and Delete buttons, following the People page's Remove.

**Why:** the desktop app's browser pane and some in-app email browsers suppress `confirm()`, which then returns false silently, so Delete did nothing there.

## Tests

UI-only; the server is unchanged, and its delete permission tests already exist. Checked by hand on the preview as a family member: Cancel keeps the update, and "Yes, delete" removes it. `npm run typecheck` and `npm test` pass.

## Cut for speed

Nothing beyond the change itself.
