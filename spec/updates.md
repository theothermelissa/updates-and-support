# Updates

How a family posts updates, how everyone reads them, reacts to them, and leaves notes on them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

## An update

An update has:

- a **body** of plain text. Line breaks are kept, and web addresses become links. There is no other formatting.
- its **author**, a family member, shown by name
- when it was **posted**, and when it was last **edited**, if ever

## The feed

The feed is the family's main page. Everyone signed in to the family sees every update, newest first, each showing its author, posted time, body, and an "edited" mark if it was edited.

A menu button sits at the top right, opposite the family's name. It opens a menu showing who is signed in (when they've given a name), a link to the People page for family members, and "Sign out." Beside it, a "Notes" link leads to the family's wall (see "The wall").

Under each update are its reactions and its notes (see "Reactions" and "Notes"). Family members also see a "Post an update" button and, on each update, "Edit" and "Delete."

## Posting

A family member writes the body and posts. The form has a **"Notify supporters by email"** checkbox, checked by default, so a small follow-up can go out without emailing everyone.

## Editing

A family member can edit any update in their family, including one written by another family member. Editing changes the body, records the edit time, and never sends notifications.

## Deleting

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden, along with its reactions and notes. When the update has notes, the confirmation says they'll be deleted too.

## Reactions

Everyone signed in to the family can react to an update: family members and supporters, including readers who haven't given a name or email. There are six reactions, shown only as emoji, with no labels: ❤️ 🙏 🤗 💪 🎉 😂.

Each person has at most one reaction per update. Picking a different emoji replaces it; picking the same one again removes it. Editing an update keeps its reactions.

Under each update, side by side:

- **A React button.** It says "React" until the viewer has reacted, then shows their emoji. On a computer, resting the pointer on it briefly opens a tray of the six emoji, which stays open while the pointer moves onto it; clicking the button opens it too. On a phone, tapping the button opens the tray. Tapping an emoji picks it and closes the tray; the viewer's current emoji is highlighted in the tray. Pressing Escape or tapping elsewhere closes the tray. The button and emoji are large enough to tap easily, work from the keyboard, and are described for screen readers.
- **A summary** in plain text next to the React button, once anyone has reacted, such as "❤️🙏😂": up to three of the emoji used, most-used first, a little smaller than the button's emoji. Screen readers also hear how many people reacted. On a computer, resting the pointer on it shows who reacted. Tapping it shows the same list under the reactions, and tapping again hides it. The list has one line per person with their emoji, such as "Ana Rivera ❤️", with the viewer first as "You ❤️" and readers without a name counted at the end, as in "and 2 others."

**Everyone who can read the feed sees who reacted.** This is a deliberate choice: the families this serves are small communities where supporters know one another, and seeing who is thinking of the family is part of the support. Only names are shown, never emails. Family members and supporters appear under the name on their record. A reader who hasn't given a name is never named, only counted; once they give a name, their earlier reaction shows it.

A removed person's reactions are neither shown nor counted, and a removed person can't react, since they can't sign in. Restoring a supporter brings their reactions back.

Reacting never asks for confirmation, and reactions send no emails or notifications. Others' new reactions appear when the page is reloaded.

## Notes

Everyone signed in to the family, family members and supporters alike, can leave notes of support on an update, and everyone signed in to the family reads every note. Sharing them is the point: the family and its support network get through this together.

A note has:

- a **body** of plain text, 1 to 1,000 characters. Line breaks are kept, and web addresses become links.
- a **color** from a fixed palette of six. The note's card is filled with the color, and its text uses a darker shade of the same hue that meets WCAG AA contrast.
- its **author**, shown by name as a signature, such as "— Ana Rivera." A family member's note is also marked "Family," so a supporter can't pass as a family member by signing with their name.
- when it was **left**

### Leaving a note

Each update has a "Leave a note" button. It opens a dialog with a text box, a row of the palette's colors with one chosen at random, and a "Leave note" button. The dialog shows the note in its chosen color as it's written, and picking a different color changes it at once. "Cancel" closes the dialog and discards the note.

A note needs a name. A supporter who hasn't given one also sees a "Your name" field in the dialog. The name goes on their record, so their later notes and reactions show it too. Giving an email later keeps this name: the feed's email form then asks only for the email. The dialog never asks for an email. Anyone who already has a name signs with it.

A person can leave any number of notes on an update, up to 20 notes an hour across the family, so one person can't flood the wall. Notes send no emails or notifications. Others' new notes appear when the page is reloaded.

### Notes under an update

Under each update, next to the reactions, a "Notes" button shows how many notes the update has, such as "3 notes," and opens or closes them. They show oldest first, as colored cards: one column on a phone and two on a computer.

### The wall

The wall, at `/f/<slug>/wall` and linked from "Notes" beside the feed's menu, shows every note in the family, newest first, as colored cards in columns of uneven heights: one column on a phone, up to three on a computer. Each card shows the note, its signature, and when it was left. Everyone signed in to the family can open it; anyone else sees the gate.

### Deleting a note

The note's author, and any family member, can delete a note, after an inline confirmation. Deletion is permanent. Notes can't be edited; to change one, delete it and leave another.

A removed person's notes are neither shown nor counted, and a removed person can't leave a note, since they can't sign in. Restoring a supporter brings their notes back.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
