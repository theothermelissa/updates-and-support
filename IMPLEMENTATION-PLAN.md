# Implementation Plan: Resolving a request

Family members can mark a request on How to help as resolved, and reopen it. A resolved request keeps its offers, shows struck through with a green check, sorts after open requests and before past ones, and refuses new offers. The spec is [spec/updates.md → Resolving a request](spec/updates.md#resolving-a-request).

## Steps

### 1. Schema

- Add `resolvedAt DateTime?` to `HelpRequest` in `prisma/schema.prisma`. Null means open.
- Write the migration by hand: `prisma/migrations/20261027000000_help_request_resolved/migration.sql`, with one `ALTER TABLE "HelpRequest" ADD COLUMN "resolvedAt" TIMESTAMP(3);`. This timestamp sorts after the newest migration on `origin/main` (`20261026000000_*`). Check for drift the way `claude/lessons.md` describes.

### 2. Server (`server/help.ts`)

- `HelpRequestView` gains `resolvedAt: string | null` (ISO). The page needs the time to sort resolved requests, and it reveals nothing beyond what the family did.
- New `resolveHelp(db, person, id, input: { resolved?: unknown })`:
  - `requireFamilyMember(person)`, so a supporter gets 403.
  - `resolved` must be a boolean, or the request is a 400.
  - `updateMany({ where: { id, familyId: person.familyId }, data: { resolvedAt: resolved ? new Date() : null } })`. A count of 0 is a 404, which covers another family's request.
  - Returns the request's view, the same way `updateHelp` does.
- `offerHelp`: the locked `SELECT` also reads `"resolvedAt"`. For a **new** offer on a resolved request, its own `if (!already && request.resolvedAt)` throws `RequestError(409, "This request has been resolved.")`. It isn't nested in the slots check, which skips "Everyone can help" requests, the main case for resolving. It comes before the name and phone writes, so nothing is stored. Withdrawing, and offering again when an offer already exists, still go through. It runs inside the same row lock as the slots check, and `resolveHelp`'s update waits on that lock, so a resolve and an offer can't interleave.
- `updateHelp` doesn't touch `resolvedAt`, so editing keeps a request resolved. `removeOffer`, `deleteHelp`, and `hasHelpRequests` are unchanged.

### 3. Endpoint

- New `api/f/[slug]/help/[id]/resolve.ts`: `POST { resolved }`, shaped like `offer.ts`. It returns `{ request }`. It's a separate endpoint because `PATCH help/[id]` requires every field, so a page from before a field existed can't clear it.

### 4. Page

- The page's `HelpRequest` type gains `resolvedAt: string | null`.
- `src/help.ts` → `sortRequests`: resolved requests come out of the other groups and form a group of their own, between undated and past, most recently resolved first. The type parameter gains `resolvedAt: string | null`.
- `src/pages/Help.tsx` → `RequestCard`:
  - `const done = request.full || request.resolvedAt !== null` drives the green check. The strikethrough is `done || past`.
  - `showButton` also needs the request not to be resolved.
  - The ⋮ menu gets **Mark as resolved** or **Reopen** between Edit and Delete. Pressing it calls a new `onResolve(resolved)` prop that posts to `help/<id>/resolve`. The page then reloads its list, the way `change` already does.
  - The check's `aria-label` becomes "Resolved" for a resolved request and stays "Covered" otherwise.

## Tests

Integration (`tests/integration/help.test.ts`, new `describe("resolving")`):

1. A family member resolves a request: offers stay, the view has `resolvedAt`, and another family member sees it resolved. Reopening clears it. Editing a resolved request keeps it resolved.
2. A supporter gets 403, and Chidi (Okafor) gets 404 on a Rivera request. `resolvedAt` stays null after both. *Prove it can fail:* remove `requireFamilyMember`, then the `familyId` filter, one at a time.
3. On an "Everyone can help" request (`slots: null`) that requires a name and a phone, a supporter with neither gets 409 when offering after it's resolved. No offer is stored, and their record is unchanged. Someone who already offered can withdraw. After reopening, a new offer succeeds. *Prove it can fail:* remove the resolved check.
4. Endpoint: `resolve.ts` gives 401 with no session and with another family's session (added to the existing loop), and 405 for GET.

Unit (`src/help.test.ts`): `sortRequests` puts resolved requests after undated ones and before past ones, most recently resolved first, including resolved requests whose dates are upcoming or past.

UI: checked by hand in the browser pane, as a family member and as a supporter.

## Cut for speed

- Nothing shows who resolved a request or when. Only the time is stored, to sort by.
- Resolving an already-resolved request (a double click, or two family members at once) moves its time forward, which can reorder the resolved group.
- Others see a resolve when they next load the page, like every other How to help change.
