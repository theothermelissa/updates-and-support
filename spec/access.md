# Access

Who can get into a family's site, how they get in, and how the family controls it. Everything in this spec is enforced on the server and covered by integration tests.

## Families

A family has:

- a **display name**, such as "Ginger's Updates" or "The Rivera Family". It heads the family's pages, is the browser tab's title on them, and names the family in emails, in phrases like "Ginger's Updates has a new update."
- a **slug**: the family's address. The family's site lives at `/f/<slug>`. A new family's slug is a name plus an 8-character random suffix, such as `rivera-k3f9m2xq`. The suffix keeps family addresses from being guessed or listed.
- a **community question** and one or more **accepted answers**
- its family members, supporters, and updates

The operator creates a family with a script, giving the display name, the question, the accepted answers, and the name and email of each family member (at least one). The script prints the family's address.

The operator can rename a family with another script, giving a new display name, a new slug, or both.
- A new slug is words of lowercase letters and numbers joined by single hyphens, such as `for-ginger`, and no other family may have it.
- It may leave out the random suffix (see "Stated limits").
- The old address stops working at once. Links already shared show "not found," and everyone signs in again at the new address.

Each email belongs to at most one person in a family: someone is either a family member or a supporter there, never both. A supporter who has only answered the question has no name or email (see "Joining").

A visit to `/f/<slug>` for a slug that does not exist shows the same generic "not found" page as any other unknown address.

## Supporters

### Joining

A visitor to a family's address who is not signed in sees the **gate**: the family's display name, the community question, and an answer box. No update content, supporter names, or family member names appear on the gate or in any response to a visitor who has not signed in.

A correct answer signs the visitor in on that device at once and shows the feed. Nothing else is asked first: they become a supporter with no name or email. Each correct answer from a device that isn't signed in creates a new supporter this way, so one person who answers on a phone and on a laptop counts as two.

### Getting notification emails

Giving an email is optional, and reading never waits on it. A signed-in supporter without an email sees a prompt at the top of the feed, "Get an email when there's a new update," which asks for their name and email and says the family will see both. The prompt stays until they give an email.

What happens depends on whom the email already belongs to in this family:

- **No one:** the name and email go on the supporter's own record, unverified, and a verification email is sent with a link to the confirmation page (see "Confirming an email"). The page tells them to check their email. Notifications start once they confirm. If the email can't be sent, the email is still added; the supporter can verify later by signing in by email.
- **A supporter or family member:** nothing changes. The email is never attached to the supporter's record, because knowing the answer must not let anyone act as someone else. Instead that address gets a magic link (see "Magic links"), and the page says the email is already on the family's list and has been sent a link to sign in. Using the link signs them in on that device as the person who owns the email. Until then, they keep reading.
- **A removed supporter or family member:** nothing changes and nothing is sent; the page says "This email can't join this family's updates. Please contact the family." They can still read, because they answered the question (see "Stated limits").

A supporter who already has an email can't change it this way.

### Added by a family member

A family member can add a supporter directly, by name and email, on the People page, so the supporter never has to find the family's address and answer the question unprompted. The form reminds the family member to double-check the email.

What happens depends on whom the email already belongs to in this family:

- **No one:** a new supporter is created, unverified, with notifications on. They get a welcome email naming the family and saying the family added them to its updates, with a link to the confirmation page (see "Confirming an email"). If the email can't be sent, they are still added.
- **A supporter:** nothing changes and no email is sent; the page says they're already a supporter.
- **A removed supporter:** nothing changes and no email is sent; the page says they were removed and can be restored from the removed list.
- **A family member, current or removed:** nothing changes and no email is sent; the page says that email belongs to a family member.

An added supporter receives no notification emails until they confirm their email, so a mistyped address gets one welcome email and nothing more.

### Confirming an email

Verification and welcome emails link to a confirmation page with a "Confirm my email" button. Pressing the button marks the email verified. The button, rather than the link alone, keeps email security scanners that open links from confirming on the person's behalf.

After confirming:

- **Signed in to this family on this device:** the page says "Thanks for confirming your email" with a button to the feed.
- **Not signed in:** the page says "Thanks for confirming your email" and, if the link can still sign this supporter in, shows the family's community question; otherwise it links to "Sign in by email." A correct answer signs the supporter in on that device, as the person the link was sent to, and shows the feed. Answers count toward the same wrong-answer limits as the gate.

A confirmation link lasts 7 days. Confirming works any number of times while the link lasts, even after the link has been used to sign in; signing in with it works once. Only a supporter can sign in this way: if the person has since become a family member or been removed, the link does nothing. Because these emails are the kind people leave in their inbox or forward, the link alone never signs anyone in; whoever uses it must also know the answer.

### Answer matching

An answer is correct if it matches any of the family's accepted answers after both are normalized: lowercased, surrounding whitespace removed, inner runs of whitespace collapsed to one space, and a leading "the " removed.

### Wrong-answer limits

The answer box has a small set of plausible values, so wrong answers are capped:

- **Per browser:** 5 wrong answers per hour.
- **Per network:** 30 wrong answers per hour. A network is one IPv4 address, or one IPv6 `/64` block, since a single home connection on IPv6 can use many addresses within its block. This limit is deliberately looser, because many real supporters can share one IP address on hospital, school, or mobile-carrier networks.

When a limit is reached, the gate says "Too many attempts. Please try again later." and refuses answers until the hour has passed.

### Returning on a new device

Answering the question on a new device gets a supporter reading there at once, as a new supporter without an email (see "Joining"). A supporter who has given an email can instead use "Already joined? Sign in by email" on the gate. They enter their email and get a magic link (see "Magic links"), unless they have been removed. Using the link signs them in on that device as themselves, with their notification settings, and marks their email verified.

### Signing out and notifications

A signed-in supporter can sign out on the current device. Once they've given an email, they can turn notification emails off or back on. Every notification email lets them turn notifications off without signing in (see [updates.md](updates.md#notifications)).

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

Removal works as it does for supporters: it ends the person's sessions, cancels their unused sign-in links, and keeps the record, marked removed, so their email can't sign in or be given by a supporter. Updates they wrote stay, still showing their name. Removed family members aren't listed; adding their email again restores them.

## Magic links

Magic links are how supporters with an email sign in as themselves on a new device, and how family members always sign in.

- The email contains a link to a page with a "Sign in" button. Pressing the button spends the link and signs the person in. The link alone never signs anyone in, because email security scanners open links before the recipient does.
- A link expires 15 minutes after it is sent and can be used once.
- Only a hash of the link's token is stored. The token sits after the `#` in the link, which browsers never send to a server, so it never appears in request logs.
- Requests are limited to 5 per email address per hour, so the form cannot be used to flood someone's inbox.
- A link signs the person in to the one family it was sent for, as whoever owns that email there. "Family sign-in" and "Already joined? Sign in by email" send the same link, so a supporter who uses the family form simply signs in as a supporter.

## Sessions

- Signing in creates a session tied to one person in one family. The browser holds a random token in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie; the server stores only its hash.
- Supporter sessions last 180 days. Family member sessions last 30 days, because they can change content.
- Every request for family data checks the session against the database. Removing a person ends all of their sessions immediately.
- A browser can be signed in to more than one family at once, each with its own session. Signing in to a family ends the browser's previous session for that family, if it had one.

## Managing supporters

Family members have a **People** page, at `/f/<slug>/people` and linked from the feed. It lists the family's family members (name and email), with a form to add one (see "Adding family members"), and the family's supporters who have an email, with a form to add one (see "Added by a family member"): name, email, whether the email is verified, whether notifications are on, and when they joined. Removed supporters are listed separately.

Supporters without an email aren't listed, since there is nothing to show. Instead the page shows how many devices are signed in without a verified email. Each device counts separately, so one person reading on a phone and a laptop counts twice, and listed supporters who haven't verified yet count too.

Supporters never see this page, the list, the count, or each other's details; the server refuses them to anyone but a family member of that family.

A family member can **remove** a supporter after confirming. Removal:

- ends all of the supporter's sessions immediately,
- cancels any unused sign-in links already sent to them,
- stops their notifications,
- keeps the record, marked removed, so the same email can't be given again.

A removed supporter cannot sign in by email: "Already joined? Sign in by email" and "Family sign-in" send them nothing, and the page still says "Check your email." Giving their email in the feed's prompt shows the refusal described in "Getting notification emails."

Removal doesn't stop someone who knows the answer from reading without an email. The removal confirmation says so, and that changing the answer keeps them out (see "Changing the community question").

A family member can **restore** a removed supporter. Restoring lets them sign in by email again and leaves their notifications **off**; they can turn notifications back on themselves once signed in. Restoring does not sign them in anywhere.

Family members are added and removed under "Adding family members" and "Removing family members."

## Changing the community question

The People page also shows the community question and its accepted answers, and a family member can change them at any time. A question must not be empty and needs at least one non-empty accepted answer; answers are entered one per line.

Removing or changing an accepted answer signs out every supporter in the family who doesn't have a verified email, including everyone reading without one, so whoever got in with the old answer has to answer again. Supporters with a verified email and family members stay signed in: the family can see them in its lists and remove them one by one.

Adding an answer or rewording the question signs no one out, because every answer that worked still works. Answers are compared after normalizing (see "Answer matching"), so changing only capitals, spacing, or a leading "the" signs no one out. An answer given at the same moment as a change is either checked against the new answers or signed out with everyone else.

Next to the form, the page explains this, with the number of devices a change to the answers would sign out.

## Stated limits

The gate keeps out bots, crawlers, and casual strangers. It does not stop a determined person, because the answer to a community question can often be looked up or passed along.

A slug chosen without the random suffix, such as `for-ginger`, can be guessed. Anyone who guesses it sees the family's display name and question, and can try answers within the wrong-answer limits.

Anyone who knows the answer can read without giving a name or email. The family sees how many devices are signed in without a verified email, but not who is behind them. If the number looks too high, or the family suspects the answer has spread, the fix is to change the answer, which signs all of them out.

Supporters who give an email appear in the supporter list with the name and email they gave. When the family sees someone there they don't recognize, the fix is to remove that supporter **and** change the answer, because removal blocks only that email and the person could keep reading without one.

Someone who knows the answer can also give the email of a real person who isn't on the family's list yet. If that person confirms the email, the device that gave it becomes a supporter with a verified email: it stays signed in when the answer changes, and it appears in the supporter list under whatever name it gave. The verification email tells anyone who didn't ask for it to ignore it.

Giving an email reveals whether it already belongs to the family: a new email goes on the supporter's record, while a known one gets a sign-in link. Someone who knows the answer could use that to learn whether a particular person follows this family. Each check leaves a trace, since a new email appears in the supporter list and a known one receives an email. Hiding it would mean holding every new email until it's verified, which isn't worth the complexity for most families.

A supporter added by a family member is only as safe as the email typed in. If the address is mistyped and belongs to a real person, that person can sign in by email and read the updates. They appear in the supporter list under the name the family gave, so the family can spot and remove them. Likewise, whoever receives a forwarded welcome email and knows the answer signs in as that supporter rather than under their own name.
