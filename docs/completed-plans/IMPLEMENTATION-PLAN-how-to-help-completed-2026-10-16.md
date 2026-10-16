# Implementation Plan — How to help

Implements `spec/updates.md` → "How to help," with the matching lines in `spec/MASTER_SPEC.md` and `spec/access.md` (who sees an offerer's name, and who sees their email).

One session, one PR. Family members write requests. Anyone signed in can offer to take one. A numbered request is struck through with a green check once enough people have offered. A "many" request never is.

## Design

**Two tables.** `HelpRequest` belongs to a family: plain text, and `slots` (a number of places, or null for "many"). `HelpOffer` is one person on one request, unique on that pair, cascading when the request or the person is deleted. Requests are listed oldest first.

**Only family members see who offered.** A supporter's response holds only their own offer and a count of all active offers (`offered`), so supporters can't compare themselves with each other, and never another person's name, email, or id. Family members see every offer's name, the email when the person has one (it's already on the People page), and the offer's id so they can remove it. No response contains a person's id. An offer requires a name, stored on the person's record the way a note's name is. A person who already has a name can't change it here.

**The last place is one row lock.** Offering locks the request, then the person. A numbered request counts active offers (this family, not removed, named) and refuses with 409 when there is no place left. Two offers at once: one waits, then sees the place taken. Withdrawing and a family member removing an offer delete the row, which opens the place. Lowering `slots` does not delete offers; the request is covered whenever the count reaches the number. "Many" never emails and never covers.

**Mail is a side effect.** A new offer on a numbered request emails the family's other family members, with a link to `/f/<slug>/help` and none of the request text. Offering again, withdrawing, removing, and offering on a "many" request send nothing. The offer stays if the email fails.

The feed link sits immediately left of Notes. Family members always see it. Supporters see it once `hasHelpRequests` is true, which `/me` reports.

## Steps

1. Migration `help_requests`, written by hand. `prisma migrate diff` shows no drift.
2. `server/help.ts`. List, create, update, delete, offer, and remove. The view hides other families, removed people, other people's offers from supporters, and every person id.
3. Handlers under `api/f/[slug]/help/`. They only parse, call, and reply.
4. The page, the feed link, and `src/help.ts` for the count beside each request.
5. Tests, below.

## Tests

`tests/integration/help.test.ts`, against real Postgres, Rivera (Ana and Luis; supporter Sam) and Okafor (Chidi; supporter Olu):

- A supporter can't add, edit, or delete a request. Another family's member gets 404 and stores nothing. Olu offering on a Rivera request is 404 and stores nothing.
- An offer inserted for Olu on a Rivera request is hidden and does not fill a place. A removed Sam's offer is hidden, doesn't fill a place, and he is 403 if he offers again. Restoring him brings the offer back.
- A supporter sees only their own offer and the total count: Sam, with Luis also offering, sees himself and `offered: 2`; a nameless reader sees no offers and the same count. Neither response contains Luis's name, any email, or any offer id. A family member sees both names, Sam's email, and the offer ids. No response contains a person id.
- A nameless reader can't offer until they give a name. That name sticks; a later offer can't rename them. Offering again and withdrawing are each idempotent.
- A numbered request covers at the count, refuses one more, and opens again when someone withdraws. Dropping the number below the current offers keeps those offers and shows covered. "Many" never covers.
- The last place, taken while the row is locked, refuses the offer that was waiting.
- The email goes to the other family members only, never contains the request text, and is skipped for a repeat, a withdrawal, and a "many" request. A failed email leaves the offer.
- The endpoints are 401 without this family's session.

`src/help.test.ts` covers the count: "everyone," "1 person," "4 people," "4 people, need 3 more," and back to "4 people" once covered or over.

UI layout is checked in the browser: add a request at the top of the page, Edit and Delete from the ⋮ menu, offer (giving a name only after pressing ✋), withdraw with the × and its dialog, cover a one-person request, and check a phone width and a wide screen.

## Progress

Typecheck passes, and all 299 tests pass. The migration applied to the test database. Removing each of these made its test fail, and restoring it made the test pass again: the request's family on an offer, hiding emails from supporters, hiding other people's offers from supporters, and hiding a removed person's offer.

In the browser, as a family member: the link sits left of Notes, a one-person request shows the green check and "You are helping" once offered, withdrawing clears both, and a "many" request lists the name without a check. As a supporter who just answered the question: the link is there because requests exist, the list shows the name only, and the page asks for a name before offering. At 360px wide the title wraps and the page does not scroll sideways.

## Cut for speed

- No drag-to-reorder. Oldest first is the order they're added.
- No email when someone offers on a "many" request, so a long list of prayers doesn't mail the family each time.
- No live updates. A new offer shows up on reload.
- No notification to supporters. Only family members are told, and only for a numbered request.
