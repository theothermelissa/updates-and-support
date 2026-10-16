# Access

Who can get into a family's site, how they get in, and how the family controls it. Everything in this spec is enforced on the server and covered by integration tests. Whoever may see an update may also see its photos and captions, and no one else (see [updates.md](updates.md#photos)).

## Families

A family has:

- a **display name**, such as "Sam's Updates" or "The Rivera Family". It heads the family's pages, is the browser tab's title on them, and names the family in emails, in phrases like "Sam's Updates has a new update."
- a **slug**: the family's address. The family's site lives at `/f/<slug>`. A new family's slug is a name plus an 8-character random suffix, such as `rivera-k3f9m2xq`. The suffix keeps family addresses from being guessed or listed.
- a **community question** and one or more **accepted answers**
- its family members, supporters, and updates

The operator creates a family with a script, giving the display name, the question, the accepted answers, and the name and email of each family member (at least one). The script prints the family's address.

The operator can rename a family with another script, giving a new display name, a new slug, or both.
- A new slug is words of lowercase letters and numbers joined by single hyphens, such as `for-sam`, and no other family may have it.
- It may leave out the random suffix (see "Stated limits").
- The old address stops working at once, unless the operator redirects it (below). Either way, everyone signs in again at the new address.

Two settings name real families, so they live in the hosting's settings rather than in this repository:

- **`ROOT_FAMILY_SLUG`** makes the site's root address, `/`, that family's home page.
  - Its own address's home page moves to `/`, and its notification emails link there.
  - Its other pages, such as sign-in and confirmation links and the People page, stay under its own address.
  - Without the setting, `/` shows "not found."
- **`FAMILY_REDIRECTS`** keeps old addresses working after a rename, as `old=new` pairs separated by commas.
  - A page at an old address moves to the same page at the new one, keeping a link's token.
  - The server treats requests to an old address as the new one, so one-click unsubscribe links in old emails still work.

Each email belongs to at most one person in a family: someone is either a family member or a supporter there, never both. A supporter who has only answered the question has no name or email (see "Joining"); one who leaves a note has a name but may have no email.

A visit to `/f/<slug>` for a slug that does not exist, and isn't redirected, shows the same generic "not found" page as any other unknown address.

## Supporters

### Joining

A visitor to a family's address who is not signed in sees the **gate**: the family's display name, the community question, and an answer box. No update content, supporter names, or family member names appear on the gate or in any response to a visitor who has not signed in.

A correct answer signs the visitor in on that device at once and shows the feed. Nothing else is asked first: they become a supporter with no name or email. Each correct answer from a device that isn't signed in creates a new supporter this way, so one person who answers on a phone and on a laptop counts as two.

### Getting notification emails

Giving an email is optional, and reading never waits on it. A signed-in supporter without an email sees a prompt at the top of the feed: "Get an email when there's a new update," with an "Add your email" button. The button opens a form that asks for their name and email and says the family will see both. If they already have a name, it's filled in, and they can change it (see "Changing your name"). "Cancel" closes the form and leaves their name as it was. The prompt stays until they give an email.

What happens depends on whom the email already belongs to in this family:

- **No one:** the name and email go on the supporter's own record, unverified, and a verification email is sent with a link to the confirmation page (see "Confirming an email"). The page tells them to check their email. Notifications start once the email is verified: they confirm it, or a family member verifies it for them (see "Managing supporters"). If the email can't be sent, the email is still added; the supporter can verify later by signing in by email.
- **A supporter or family member:** nothing changes, and the name typed in the form is not saved. The email is never attached to the supporter's record, because knowing the answer must not let anyone act as someone else. Instead that address gets a magic link (see "Magic links"), and the page says the email is already on the family's list and has been sent a link to sign in. Using the link signs them in on that device as the person who owns the email. Until then, they keep reading.
- **A removed supporter or family member:** nothing changes and nothing is sent; the page says "This email can't join this family's updates. Please contact the family." They can still read, because they answered the question (see "Stated limits").

A supporter who already has an email can't change it this way.

### Added by a family member

A family member can add a supporter directly, by name and email, on the People page, so the supporter never has to find the family's address and answer the question unprompted. The form reminds the family member to double-check the email.

What happens depends on whom the email already belongs to in this family:

- **No one:** a new supporter is created, unverified, with notifications on. They get a welcome email naming the family and saying the family added them to its updates, with a link to the confirmation page (see "Confirming an email"). If the email can't be sent, they are still added.
- **A supporter:** nothing changes and no email is sent; the page says they're already a supporter.
- **A removed supporter:** nothing changes and no email is sent; the page says they were removed and can be restored from the removed list.
- **A family member, current or removed:** nothing changes and no email is sent; the page says that email belongs to a family member.

An added supporter receives no notification emails until their email is verified, either by confirming it or by a family member verifying it (see "Managing supporters"), so a mistyped address gets one welcome email and nothing more unless a family member verifies it.

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

## Changing your name

Anyone signed in to a family can change their own name, and only their own. The new name replaces the one on their record. It has to be 1 to 100 characters after trimming; they can't clear it. Notes, reactions, and updates show the name on the author's record, so the new name appears on everything they've already left, not only on what they write next. A family member's notes stay marked "Family," which follows their role and not the name they choose.

Three places save a name:

- **The feed's menu.** "Edit name" sits with "Signed in as," above the line, once they have a name. It opens a dialog with the name filled in, and a line saying this is the name people see for them. "Save" stores it. "Cancel" leaves it as it was.
- **Leave a note.** The dialog's name field is filled in, and they can change it. The name is saved when the note is, and not if they cancel or the note isn't saved (see [updates.md](updates.md#leaving-a-note)).
- **The feed's email form.** A supporter adding an email can change the name in that form. The name is saved only when they changed it and the email is added to their record. If they leave the name as it was, or the email already belongs to someone in the family, or it can't be added, their name stays as it was (see "Getting notification emails").

Someone with no name doesn't see "Edit name." They give one by leaving a note or adding an email. The wall has no menu; a name changed on the feed shows there the next time it loads.

## Managing supporters

Family members have a **People** page, at `/f/<slug>/people` and linked from the feed. It lists the family's family members (name and email), with a form to add one (see "Adding family members"), and the family's supporters who have an email, with a form to add one (see "Added by a family member"): name, email, whether the email is verified, whether notifications are on, and when they joined. Removed supporters are listed separately.

Supporters without an email aren't listed, even when they've given a name with a note. Instead the page shows how many devices are signed in without a verified email. Each device counts separately, so one person reading on a phone and a laptop counts twice, and listed supporters who haven't verified yet count too.

Supporters never see this page, the list, the count, or each other's details; the server refuses them to anyone but a family member of that family. The one thing supporters see of each other is the name on a reaction or a note (see [updates.md](updates.md#reactions) and [updates.md](updates.md#notes)). Supporters never see who else offered to help (see [updates.md](updates.md#how-to-help)).

A family member can **remove** a supporter after confirming. Removal:

- ends all of the supporter's sessions immediately,
- cancels any unused sign-in links already sent to them,
- stops their notifications,
- keeps the record, marked removed, so the same email can't be given again.

A removed supporter cannot sign in by email: "Already joined? Sign in by email" and "Family sign-in" send them nothing, and the page still says "Check your email." Giving their email in the feed's prompt shows the refusal described in "Getting notification emails."

Removal doesn't stop someone who knows the answer from reading without an email. The removal confirmation says so, and that changing the answer keeps them out (see "Changing the community question").

A family member can **restore** a removed supporter. Restoring lets them sign in by email again and leaves their notifications **off**; they can turn notifications back on themselves once signed in. Restoring does not sign them in anywhere.

A family member can **verify** a listed supporter whose email isn't verified yet, for supporters who never manage the emailed confirmation. A "Verify" button appears only on those rows, and only the server's check decides who may use it. Pressing it verifies the email at once, without a confirmation step. Verifying:

- marks the email verified, exactly as confirming it would: notifications start if they're on, and the supporter stays signed in when an accepted answer changes,
- leaves their sessions and notification setting as they are, so no one is signed out,
- leaves any confirmation link already sent to them working as before; confirming with it again changes nothing.

Only an active supporter with an unverified email in the family member's own family can be verified. Verifying an email that's already verified changes nothing.

Family members are added and removed under "Adding family members" and "Removing family members."

## Changing the community question

The People page also shows the community question and its accepted answers, and a family member can change them at any time. A question must not be empty and needs at least one non-empty accepted answer; answers are entered one per line.

Removing or changing an accepted answer signs out every supporter in the family who doesn't have a verified email, including everyone reading without one, so whoever got in with the old answer has to answer again. Supporters with a verified email and family members stay signed in: the family can see them in its lists and remove them one by one.

Adding an answer or rewording the question signs no one out, because every answer that worked still works. Answers are compared after normalizing (see "Answer matching"), so changing only capitals, spacing, or a leading "the" signs no one out. An answer given at the same moment as a change is either checked against the new answers or signed out with everyone else.

Next to the form, the page explains this, with the number of devices a change to the answers would sign out.

## Stated limits

The gate keeps out bots, crawlers, and casual strangers. It does not stop a determined person, because the answer to a community question can often be looked up or passed along.

A slug chosen without the random suffix, such as `for-sam`, can be guessed, and the family shown at the site's root can be found by anyone who knows the site's address. Either way, the finder sees the family's display name and question, and can try answers within the wrong-answer limits.

Anyone who knows the answer can read without giving a name or email. The family sees how many devices are signed in without a verified email, but not who is behind them. If the number looks too high, or the family suspects the answer has spread, the fix is to change the answer, which signs all of them out.

Supporters who give an email appear in the supporter list with the name and email they gave. When the family sees someone there they don't recognize, the fix is to remove that supporter **and** change the answer, because removal blocks only that email and the person could keep reading without one.

Someone who knows the answer can also give the email of a real person who isn't on the family's list yet. If that person confirms the email, the device that gave it becomes a supporter with a verified email: it stays signed in when the answer changes, and it appears in the supporter list under whatever name it gave. The verification email tells anyone who didn't ask for it to ignore it.

A verified email means either its owner confirmed it or a family member verified it, and a family member's verification is trusted as is. Because the community question keeps casual observers out rather than guarding against someone who already knows the answer, the app adds no confirmation step or sign-out to protect against a mistaken verification. If a family member verifies an entry made by someone posing as a person they know, that device stays signed in when the answer changes and gets notification emails, until the family removes that supporter and changes the answer. The remaining real cost is a mistyped address: verifying it sends notification emails to whoever owns that address until the supporter is removed.

Anyone who knows the answer sees the names of everyone who has reacted to an update or a note, so they can learn that a particular person follows this family. Names are whatever each person gave, so someone could also react under another person's name; the family sees named supporters in its supporter list and can remove them. Reactions from readers who never gave a name are counted without a name and can't be removed one by one, since the family can't see who those readers are. They stay even after the reader is signed out, for example by a change to the answer.

Only family members see who offered to help, under the name each person gave, which can be someone else's. Anyone who knows the answer sees how many people offered on each request. An offer requires a name, so there is no unnamed offer. Family members see the offerer's email when they have one, which is the same email already on the People page, and can remove any offer. A person who offered with a name and no email still isn't on the People page; the family has only the name. Removing the person, when they have an email, hides their offers. Changing the answer signs out anyone without a verified email, and their offers stay, the same way reactions do.

A photo's link keeps working for anyone who has it until the photo is deleted, like a photo-sharing link. Someone who saves or forwards a link from the feed can show that photo to others, and a supporter who is later removed, or signed out by a change to the answer, can still open links they saved. Deleting the photo, or the update it's on, ends every link to it within a few minutes. If Cloudinary can't be reached when a photo is deleted, the photo disappears from the app, but links saved earlier keep working until it's deleted from Cloudinary by hand. Browsers also keep copies of photos they've shown, so on a shared device, photos can stay in the browser's cache after signing out. The operator's Cloudinary account can see every family's stored photos, which are the shrunk copies without embedded details.

Giving an email reveals whether it already belongs to the family: a new email goes on the supporter's record, while a known one gets a sign-in link. Someone who knows the answer could use that to learn whether a particular person follows this family. Each check leaves a trace, since a new email appears in the supporter list and a known one receives an email. Hiding it would mean holding every new email until it's verified, which isn't worth the complexity for most families.

A supporter added by a family member is only as safe as the email typed in. If the address is mistyped and belongs to a real person, that person can sign in by email and read the updates. They appear in the supporter list under the name the family gave, so the family can spot and remove them. Likewise, whoever receives a forwarded welcome email and knows the answer signs in as that supporter rather than under their own name.

A video note is shown through a link to Cloudinary that the server creates only for someone signed in to the family. The link is signed, so it can't be guessed or altered, but it doesn't expire: anyone who copies or is forwarded it can watch that video until the note is deleted, including a supporter who has since been removed. They can't use it to find any other video. Links that expire need a Cloudinary plan the app doesn't use; this is about as much as someone could already keep by recording the screen while they had access. Deleting the note deletes the video, and every link to it stops working within minutes, once Cloudinary has cleared its cached copies.

Anyone who knows the answer can leave a note signed with any name, including one that isn't theirs, such as "Mom," and changing their name shows that name on their earlier notes and reactions too. The family can delete any note. A note's author who never gave an email isn't in the supporter list and can't be removed one by one; if it keeps happening, the fix is to change the answer, which signs out everyone without a verified email.
