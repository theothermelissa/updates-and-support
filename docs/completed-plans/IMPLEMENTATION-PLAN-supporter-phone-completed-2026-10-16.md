# Implementation plan: supporter phone numbers

## Goal

A supporter can keep a phone number on their record, from the menu or when offering on a request that requires one. Family members see it beside that supporter's offers and on the People page. Nothing is ever sent to it. See `spec/access.md` → "Your phone number" and `spec/updates.md` → "How to help."

## Approach

The number lives on `Person`, not on the offer. An email on a record lets someone sign in as that person, which is why an email given with an offer stays on the offer alone. A phone number signs no one in, so keeping it on the record can't help anyone act as someone else.

One rule decides who sees a number: the server fills it in only in responses built for a family member of the same family, and only for a supporter's record. Everywhere else it's null. Every response that carries a person today picks its fields one by one, so adding the column exposes nothing until a step below adds it. A database check makes "family members never have a phone" structural rather than something each write path has to remember.

## Steps

1. **Schema.** A hand-written migration adds `Person.phone String?`, `HelpRequest.requirePhone Boolean @default(false)`, and `CHECK (role = 'supporter' OR phone IS NULL)` on `Person`. Confirm `prisma migrate diff` shows no drift.
2. **`server/phone.ts`.** `validPhone(value)` trims and accepts only digits, spaces, and `+ - ( ) .`, with 7 to 15 digits; an empty string means "clear" and returns null. `setOwnPhone(db, person, phone)` writes with `updateMany` where `id`, `familyId`, `role: "supporter"`, and `removedAt: null` all match, and returns 403 when nothing matched. The session's person object can be stale: a supporter promoted mid-request must not get a phone written to them.
3. **`api/f/[slug]/phone.ts`.** `POST { phone }`, shaped like `name.ts`. `personView` adds `phone`, which only ever goes to its own person.
4. **`server/help.ts`.**
   - `requirePhone` joins the request fields and `validRequest`'s required list, so an out-of-date page asks for a refresh rather than clearing the checkbox.
   - `offerHelp` reads `phone` and `role` in its locked `SELECT`. On a new offer (not one already made, so re-submitting or withdrawing is never asked), when the request requires a phone, the person is a supporter, and they have none, `validPhone(input.phone)` must return a number. The name and phone are validated before either is written, then saved in one `person.update` in the same transaction, before the offer.
   - `requestInclude` adds `phone` and `role` to the offerer's select. `view` adds `phone` to each offer: the person's phone when the viewer is a family member and the offerer is a supporter, otherwise null.
5. **`server/people.ts`.** `SupporterView` adds `phone`. `addFamilyMember`'s promotion of a supporter sets `phone: null`.
6. **UI.**
   - `familyShell.tsx`: for supporters, "Add phone number" or "Edit phone number" in the menu, using `NameDialog` generalized into a one-field dialog (title, label, hint, initial value, whether it may be empty). It's shown whether or not they have a name, so the existing name section's separator needs rearranging.
   - `Help.tsx`: the Require phone checkbox after Require email; "Your phone number (only the family will see this)" in the offer fields when `requirePhone`, the viewer is a supporter, and `me.person.phone` is null; and the phone as a `tel:` link beside each offer for family members.
   - `People.tsx`: a phone column, also a `tel:` link, for active and removed supporters.

## Tests

Integration tests against Postgres, in `tests/integration/help.test.ts`, `people.test.ts`, and a new `phone.test.ts`. Each access test gets the remove-the-rule check from `claude/lessons.md`.

- **Supporters never see a phone.** A supporter listing help gets `phone: null` on their own offer and sees no one else's. A family member gets the supporter's phone. A family member of another family sees nothing of the first family's requests (existing scoping, plus a phone assertion).
- **Only your own record.** `setOwnPhone` changes only the signed-in person's row, refuses a family member, refuses a stale supporter object after that person was promoted (phone stays null), rejects an invalid number without writing, and clears on an empty string.
- **Offering with Require phone.** A supporter without a phone is refused without one, and nothing is written (no offer, no phone). With a valid one, the offer is made and the phone is on their record. A supporter who already has one isn't asked, and their phone stays unchanged. A family member offers without being asked. A supporter who offered before the request was switched to Require phone can re-submit and withdraw without one. An invalid phone on a request that also requires a name writes neither the name nor the phone.
- **People page.** `listPeople` includes supporters' phones; supporters are still refused (existing test).
- **Promotion clears the phone,** and a promoted former supporter's offer shows `phone: null` to the family.
- **Unit,** in `server/phone.test.ts`: `validPhone` accepts common US and international forms, and rejects letters, too few or too many digits, and over-long input.

The menu dialog, the offer field, and both tables get checked by hand in the browser pane.

## Cut for speed

- **Supporters without an email still aren't listed on the People page,** so a supporter who has only a phone number shows it only beside their offers.
- **No formatting or normalization.** Numbers show as typed, so the same number can look different on two records.
- **No way for a family member to add or edit a supporter's phone.**

## Discoveries

- `FamilyShell`'s `onNameChanged` prop is now `onPersonChanged`, because the menu also saves the phone number, and the Help page needs `me.person.phone` reloaded so it stops asking.
- Every rule this change adds failed its test when removed: the family-only view, both `setOwnPhone` guards, the required-phone check, the "new offers only" guard, the supporters-only ask, and clearing on promotion. The offer view's role check can't be tested that way, because the database check stops a family member from ever having a phone; it stays as defense in depth.
- Checked in the browser pane locally: the menu dialog refuses a bad number and saves a good one, a Require phone offer asks for the name and number together and saves both, the supporter's help response never contains the number, and the family sees it as a `tel:` link beside the offer and in the People table, which scrolls inside its own box.
- Added while reviewing the preview: every email box uses one `EmailInput` that says "Please enter a valid email address." instead of the browser's own warning, and while an offer asks for details, "I can help with this" becomes a solid black Confirm button.
