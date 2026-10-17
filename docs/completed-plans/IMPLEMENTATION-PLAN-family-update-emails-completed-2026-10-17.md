# Implementation plan: notification emails for family members

Spec: [updates.md → Notifications](spec/updates.md#notifications), [access.md → Signing out and notifications](spec/access.md#signing-out-and-notifications), [access.md → Signing in](spec/access.md#signing-in) (family members), and the new family-email paragraph in [access.md → Stated limits](spec/access.md#stated-limits).

## What changes

New updates are emailed to the family's family members as well as its supporters, except the family member who posted. Family members can turn the emails off the same ways supporters can.

No schema change: every `Person` already has `notificationsOn` (default true) and an `unsubscribeToken`.

## Steps

1. **`server/notifications.ts`.** Rename `notifySupporters` to `notifyNewUpdate(db, send, familyId, authorId, photos, video)`. Recipients: people in the family with an email, `notificationsOn`, `removedAt: null`, `id ≠ authorId`, and `OR: [{ role: "family" }, { emailVerifiedAt: { not: null } }]`. Update its comment and the supporter-only comments on `unsubscribe` and `setNotifications`.
2. **`server/updates.ts`.** Both `createUpdate` and `createVideoUpdate` call `notifyNewUpdate` with `person.id` as the author.
3. **Unsubscribing.** `unsubscribe` drops its `role: "supporter"` filter, so a family member's link and one-click header work. `setNotifications` drops its supporter-only check. Update the comments that say supporters only: on `notificationsOn` and `removedAt` in `prisma/schema.prisma` (comments only, no migration), and in `api/f/[slug]/notifications.ts`.
4. **`server/people.ts`.** When `addFamilyMember` promotes or restores a removed person, it also sets `notificationsOn: true`, since removing a supporter turned it off.
5. **`src/pages/FamilyHome.tsx`.** Show "Email me when there's a new update" to family members too: its condition becomes just `me.person.email`, since family members always have one. The "Emails start once you confirm…" hint stays supporter-only, since family members aren't verified first.
6. **`src/components/postSettings.tsx`.** "Notify supporters by email" becomes "Notify everyone by email"; the bell's label becomes "Emails everyone."
7. **`tests/integration/people.test.ts`.** Update the `notifySupporters` call to `notifyNewUpdate`.

## Tests

In `tests/integration/notifications.test.ts`, against real Postgres. The fixture gains a second family member (Ben, unverified, never signed in), an opted-out family member, and a removed family member.

- **Recipients:** Ana posts; the emails go to exactly Ben and Sam. Not Ana (the author), not the opted-out or removed family member, not the unverified, opted-out, or removed supporters, not the email-less reader, and not the Okafor family's people. Replaces "emails only this family's verified, opted-in, active supporters."
- **Unsubscribe:** a family member's token turns off their notifications at their own family's address and not at another's. Extends the existing unsubscribe test.
- **Toggle:** `setNotifications` works for a family member. Replaces the "but not a family member" assertion.
- **Video path:** in `tests/integration/videos.test.ts`, the "says the email is a video" test gains a second family member and asserts the recipients are exactly Sam and that family member, so the author is excluded on the video path too.
- **Promotion:** in `tests/integration/people.test.ts`, adding a removed supporter as a family member turns their notifications back on, and promoting an opted-out supporter who was never removed leaves them off.

Prove the recipient test can fail by removing, one at a time, the author exclusion, the `removedAt` filter, and the supporter verification check, then restoring each one.

## Cut for speed

- The People page still shows notification status only for supporters, not for family members.
