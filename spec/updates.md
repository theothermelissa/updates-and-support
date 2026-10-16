# Updates

How a family posts updates, how everyone reads and reacts to them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

## An update

An update has:

- its **content**: an ordered list of blocks, each either
  - a **text block** of plain text, where line breaks are kept and web addresses become links, with no other formatting, or
  - a **photo block**: one photo with an optional **caption** of plain text, up to 300 characters (see "Photos")
- its **author**, a family member, shown by name
- when it was **posted**, and when it was last **edited**, if ever

An update has at least one block, at most 20 blocks, at most six of them photo blocks, and at most 20,000 characters of text across its text blocks. A text block can't be empty.

## The feed

The feed is the family's main page. Everyone signed in to the family sees every update, newest first, each showing its author, posted time, content, and an "edited" mark if it was edited. Blocks appear in order: text as paragraphs, and each photo at the full width of the feed with its caption, if any, beneath it.

Family members also see a "Post an update" button and, on each update, "Edit" and "Delete."

## Writing an update

Posting and editing use the same editor: a column of the update's blocks in order, each text block a text box and each photo block a card with the photo, a caption field, and "Remove." Text boxes have "Remove" too. "Add text" and "Add photo" at the bottom add a block at the end. Blocks can't be moved; to change the order, remove a block and add it again. Empty text boxes are left out when the update is saved. A new update starts with one empty text box.

## Posting

A family member writes the update and posts. The form has a **"Notify supporters by email"** checkbox, checked by default, so a small follow-up can go out without emailing everyone.

## Editing

A family member can edit any update in their family, including one written by another family member. Editing can change, add, and remove text and photo blocks and captions. It records the edit time and never sends notifications.

## Deleting

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden, along with its reactions and its photos (see "Photos").

## Photos

Photos are available once the operator turns them on with a setting (see the README). Until then, no "Add photo" button appears and the server accepts no photo blocks.

**Adding.** "Add photo" opens the device's photo picker for one photo, including iPhone photos. The photo uploads as soon as it's chosen, and its card shows it with "Uploading…" until it's done; saving waits until every photo has finished uploading. A photo over 10 MB is refused with a message saying so. Removing a photo block deletes the photo permanently once the update is saved.

**Who sees them.** Photos and captions are seen by exactly the people who can see the update (see [access.md](access.md)). They never appear on the gate or in emails.

**How they're kept private.** Photos are stored privately with Cloudinary, a photo-hosting service.
- Before storing a photo, Cloudinary shrinks it to at most 1600 pixels wide and removes its embedded details, such as location and camera, so the file as taken is never kept.
- Nobody can view a stored photo without a link the server signs with the app's secret key, and the server creates those links only in the feed it sends to someone signed in to the family. A link can't be guessed or altered to show a different photo or size.
- While a photo loads, a grey box holds its place.

**Deleting.** Deleting an update, or removing a photo block while editing, deletes the photo from Cloudinary as well as from the app. If Cloudinary can't be reached at that moment, the photo still disappears from the app at once (see "Stated limits" in [access.md](access.md)).

**Placeholder photos, for testing.** On test sites (previews and local development) where the operator has turned on placeholder photos with their own setting, choosing a photo uploads nothing: the block is saved as a placeholder, shown as a plain grey box in a 4:3 shape with its caption beneath. Placeholders behave like photos in every other way: they count toward the six, take captions, can be removed, and count in notification subjects. The production site never accepts placeholders, whatever its settings. Where real photos are also turned on, new photos are real, and placeholders saved earlier stay grey boxes.

There is no reordering, no video, and supporters can't add photos.

## Reactions

Everyone signed in to the family can react to an update: family members and supporters, including readers who haven't given a name or email. There are six reactions, shown only as emoji, with no labels: ❤️ 🙏 🤗 💪 🎉 😂.

Each person has at most one reaction per update. Picking a different emoji replaces it; picking the same one again removes it. Editing an update keeps its reactions.

Under each update, side by side:

- **A React button.** It says "React" until the viewer has reacted, then shows their emoji. On a computer, resting the pointer on it briefly opens a tray of the six emoji, which stays open while the pointer moves onto it; clicking the button opens it too. On a phone, tapping the button opens the tray. Tapping an emoji picks it and closes the tray; the viewer's current emoji is highlighted in the tray. Pressing Escape or tapping elsewhere closes the tray. The button and emoji are large enough to tap easily, work from the keyboard, and are described for screen readers.
- **A summary** in plain text next to the React button, once anyone has reacted, such as "❤️🙏😂": up to three of the emoji used, most-used first, a little smaller than the button's emoji. Screen readers also hear how many people reacted. On a computer, resting the pointer on it shows who reacted. Tapping it shows the same list under the reactions, and tapping again hides it. The list has one line per person with their emoji, such as "Ana Rivera ❤️", with the viewer first as "You ❤️" and readers without a name counted at the end, as in "and 2 others."

**Everyone who can read the feed sees who reacted.** This is a deliberate choice: the families this serves are small communities where supporters know one another, and seeing who is thinking of the family is part of the support. Only names are shown, never emails. Family members and supporters appear under the name on their record. A reader who hasn't given a name is never named, only counted; once they give a name, their earlier reaction shows it.

A removed person's reactions are neither shown nor counted, and a removed person can't react, since they can't sign in. Restoring a supporter brings their reactions back.

Reacting never asks for confirmation, and reactions send no emails or notifications. Others' new reactions appear when the page is reloaded.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content. When the update has photos, the subject says how many, as in "Sam's Updates has a new update (2 photos)"; the photos themselves are never attached or linked.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
