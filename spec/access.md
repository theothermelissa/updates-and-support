# Access

Who can get into a family's site, how they get in, and how the family controls it. Everything in this spec is enforced on the server and covered by integration tests.

## Families

A family has:

- a **display name**, such as "The Rivera Family"
- a **slug**: a name plus an 8-character random suffix, such as `rivera-k3f9m2xq`. The family's site lives at `/f/<slug>`. The suffix keeps family addresses from being guessed or listed.
- a **community question** and one or more **accepted answers**
- its family members, supporters, and updates

The operator creates a family with a script, giving the display name, the question, the accepted answers, and the name and email of each family member (at least one). The script prints the family's address.

Each email belongs to at most one person in a family: someone is either a family member or a supporter there, never both.

A visit to `/f/<slug>` for a slug that does not exist shows the same generic "not found" page as any other unknown address.

## Supporters

### Joining

A visitor to a family's address who is not signed in sees the **gate**: the family's display name, the community question, and an answer box. No update content, supporter names, or family member names appear on the gate or in any response to a visitor who has not signed in.

1. The visitor answers the question.
2. On a correct answer, they enter their name and email.
3. They are signed in on that device immediately and see the feed.
4. A verification email is sent. It contains a link to a page with a "Confirm my email" button; pressing the button marks the email verified. The button, rather than the link alone, keeps email security scanners that open links from confirming on the person's behalf. If the email can't be sent, joining still succeeds; the supporter can verify later by signing in by email.

A verification link works once, for 7 days, and only verifies: it never signs anyone in. Verification emails are the kind people leave in their inbox or forward, so a link that signed people in would hand a long session to whoever received the forward.

If the email already belongs to someone in this family, supporter or family member, the visitor is not signed in as that person. Instead a magic link is sent to that email, as in "Returning on a new device." The page says the same thing whether or not the email was already known: "Check your email."

If the email belongs to a removed supporter, joining is refused with "This email can't join this family's updates. Please contact the family."

### Answer matching

An answer is correct if it matches any of the family's accepted answers after both are normalized: lowercased, surrounding whitespace removed, inner runs of whitespace collapsed to one space, and a leading "the " removed.

### Wrong-answer limits

The answer box has a small set of plausible values, so wrong answers are capped:

- **Per browser:** 5 wrong answers per hour.
- **Per network:** 30 wrong answers per hour. A network is one IPv4 address, or one IPv6 `/64` block, since a single home connection on IPv6 can use many addresses within its block. This limit is deliberately looser, because many real supporters can share one IP address on hospital, school, or mobile-carrier networks.

When a limit is reached, the gate says "Too many attempts. Please try again later." and refuses answers until the hour has passed.

### Returning on a new device

The gate offers "Already joined? Sign in by email." The supporter enters their email and gets a magic link (see "Magic links"), unless they have been removed. Using the link signs them in on that device and marks their email verified.

### Signing out and notifications

A signed-in supporter can sign out on the current device and can turn notification emails off or back on. Every notification email lets them turn notifications off without signing in (see [updates.md](updates.md#notifications)).

## Family members

### Signing in

Family members always sign in by magic link. The family's gate offers "Family sign-in," which asks for an email. If the email belongs to anyone in that family who hasn't been removed, a magic link is sent (see "Magic links"). The page says "Check your email" whether or not the email is known.

A family member never needs to answer the community question.

### Adding family members

Any family member can add another family member by name and email, on the People page. The new family member gets an email saying they've been added to the family's updates, with a magic link to sign in (see "Magic links"). The email says that once the link expires, they can sign in any time with "Family sign-in." If the email can't be sent, they are still added.

What happens depends on whom the email already belongs to in this family:

- **No one:** a new family member is created.
- **A supporter:** the supporter is **promoted**. The same record becomes a family member with the name just entered, and all of their sessions end, so they sign in again with a family member's session. If they had been removed, promotion also restores them.
- **A removed family member:** they are restored, with the name just entered.
- **A current family member:** nothing changes and no email is sent; the page says they're already a family member.

### Removing family members

Any family member can remove another family member from the People page, after confirming. A family member cannot remove themselves, and a family always keeps at least one family member: the server refuses a removal that would leave none, even if two removals happen at the same moment.

Removal works as it does for supporters: it ends the person's sessions, cancels their unused sign-in links, and keeps the record, marked removed, so their email can't sign in or join as a supporter. Updates they wrote stay, still showing their name. Removed family members aren't listed; adding their email again restores them.

## Magic links

Magic links are how supporters return on a new device and how family members always sign in.

- The email contains a link to a page with a "Sign in" button. Pressing the button spends the link and signs the person in. The link alone never signs anyone in, because email security scanners open links before the recipient does.
- A link expires 15 minutes after it is sent and can be used once.
- Only a hash of the link's token is stored. The token sits after the `#` in the link, which browsers never send to a server, so it never appears in request logs.
- Requests are limited to 5 per email address per hour, so the form cannot be used to flood someone's inbox.
- A link signs the person in to the one family it was sent for, as whoever owns that email there. "Family sign-in" and "Already joined? Sign in by email" send the same link, so a supporter who uses the family form simply signs in as a supporter.

## Sessions

- Signing in creates a session tied to one person in one family. The browser holds a random token in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie; the server stores only its hash.
- Supporter sessions last 180 days. Family member sessions last 30 days, because they can change content.
- Every request for family data checks the session against the database. Removing a person ends all of their sessions immediately.
- A browser can be signed in to more than one family at once, each with its own session.

## Managing supporters

Family members have a **People** page, at `/f/<slug>/people` and linked from the feed. It lists the family's family members (name and email), with a form to add one (see "Adding family members"), and the family's supporters: name, email, whether the email is verified, whether notifications are on, and when they joined. Removed supporters are listed separately. Supporters never see this page, this list, or each other's details; the server refuses the list to anyone but a family member of that family.

A family member can **remove** a supporter after confirming. Removal:

- ends all of the supporter's sessions immediately,
- cancels any unused sign-in links already sent to them,
- stops their notifications,
- keeps the record, marked removed, so the same email cannot join again.

A removed supporter cannot sign in by email: "Already joined? Sign in by email" and "Family sign-in" send them nothing, and the page still says "Check your email." Joining with their email shows the refusal described in "Joining."

A family member can **restore** a removed supporter. Restoring lets them sign in by email again and leaves their notifications **off**; they can turn notifications back on themselves once signed in. Restoring does not sign them in anywhere.

Family members are added and removed under "Adding family members" and "Removing family members."

## Changing the community question

The People page also shows the community question and its accepted answers, and a family member can change them at any time. A question must not be empty and needs at least one non-empty accepted answer; answers are entered one per line. The change affects only people joining afterwards; no one already signed in is signed out.

## Stated limits

The gate keeps out bots, crawlers, and casual strangers. It does not stop a determined person, because the answer to a community question can often be looked up or passed along. Anyone who gets in appears in the supporter list with the name and email they gave.

Joining also reveals whether an email already belongs to the family: a new email is signed in at once, while a known one is told to check their email. Someone who knows the answer could use that to learn whether a particular person follows this family. Hiding it would mean making every supporter confirm by email before reading, and that friction isn't worth it for most families.

When the family sees someone they don't recognize, the fix is to remove that supporter **and** change the question. Removal alone blocks only that email, and the person could join again with a different email using the same answer.
