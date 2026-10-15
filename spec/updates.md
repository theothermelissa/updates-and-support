# Updates

How a family posts updates, how everyone reads and reacts to them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

## An update

An update has:

- a **body** of plain text. Line breaks are kept, and web addresses become links. There is no other formatting.
- its **author**, a family member, shown by name
- when it was **posted**, and when it was last **edited**, if ever

## The feed

The feed is the family's main page. Everyone signed in to the family sees every update, newest first, each showing its author, posted time, body, and an "edited" mark if it was edited.

Family members also see a "Post an update" button and, on each update, "Edit" and "Delete."

## Posting

A family member writes the body and posts. The form has a **"Notify supporters by email"** checkbox, checked by default, so a small follow-up can go out without emailing everyone.

## Editing

A family member can edit any update in their family, including one written by another family member. Editing changes the body, records the edit time, and never sends notifications.

## Deleting

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden, along with its reactions.

## Reactions

Everyone signed in to the family can react to an update: family members and supporters, including readers who haven't given a name or email. There are six reactions, shown only as emoji, with no labels: ❤️ 🙏 🤗 💪 🎉 😂.

Each person has at most one reaction per update. Picking a different emoji replaces it; picking the same one again removes it. Editing an update keeps its reactions.

Under each update, side by side:

- **A React button.** It says "React" until the viewer has reacted, then shows their emoji. On a computer, resting the pointer on it briefly opens a tray of the six emoji, which stays open while the pointer moves onto it; clicking the button opens it too. On a phone, tapping the button opens the tray. Tapping an emoji picks it and closes the tray; the viewer's current emoji is highlighted in the tray. Pressing Escape or tapping elsewhere closes the tray. The button and emoji are large enough to tap easily, work from the keyboard, and are described for screen readers.
- **A summary**, once anyone has reacted, such as "7 Reacted: ❤️🙏😂": how many people reacted, then up to three of the emoji used, most-used first. On a computer, resting the pointer on it shows who reacted. Tapping it shows the same list under the reactions, and tapping again hides it. The list has one line per person with their emoji, such as "Ana Rivera ❤️", with the viewer first as "You ❤️" and readers without a name counted at the end, as in "and 2 others."

**Everyone who can read the feed sees who reacted.** This is a deliberate choice: the families this serves are small communities where supporters know one another, and seeing who is thinking of the family is part of the support. Only names are shown, never emails. Family members and supporters appear under the name on their record. A reader who hasn't given a name is never named, only counted; once they give a name, their earlier reaction shows it.

A removed person's reactions are neither shown nor counted, and a removed person can't react, since they can't sign in. Restoring a supporter brings their reactions back.

Reacting never asks for confirmation, and reactions send no emails or notifications. Others' new reactions appear when the page is reloaded.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
