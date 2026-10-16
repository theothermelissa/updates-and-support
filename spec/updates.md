# Updates

How a family posts updates, how everyone reads them, reacts to them, and leaves notes on them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

## An update

An update has:

- its **content**: formatted text with optional photos, in the order the family member wrote them. The formatting is deliberately small:
  - paragraphs and line breaks
  - **bold** and *italic*
  - links, to web addresses (`http:` or `https:`) and email addresses (`mailto:`)
  - bulleted and numbered lists, which can be nested
  - photos, each with an optional **caption** of plain text up to 300 characters (see "Photos")
- its **author**, a family member, shown by name
- when it was **posted**, and when it was last **edited**, if ever

There are no headings, colors, fonts, tables, code, quotes, or images from other websites. An update can't be empty, and it has at most 20,000 characters of text, at most six photos, and lists nested at most three levels deep.

## The feed

The feed is the family's main page. Everyone signed in to the family sees every update, newest first, each showing its author, posted time, content, and an "edited" mark if it was edited. Content appears as written: formatted text, lists, and each photo at the full width of the feed with its caption, if any, beneath it. Links open in a new tab. An update written before formatting existed shows as it always did, with its web addresses as links.

A menu button sits at the top right, opposite the family's name. It opens a menu showing who is signed in (when they've given a name), a link to the People page for family members, and "Sign out." Beside it, a "Notes" link leads to the family's wall (see "The wall"). Immediately to its left, a "How to help" link leads to the family's requests (see "How to help"). Family members always see that link. Supporters see it once the family has at least one request.

Each update has a footer of actions in one row: **React** and **Leave a note** for everyone signed in, and **Edit** and **Delete** as well for family members, on the right. On a phone the row wraps rather than shrinking the buttons. Family members also see a "Post an update" button above the feed. Notes sit beside the update on a wide screen, and below it on a phone (see "Reactions" and "Notes"). While a family member is editing an update or confirming a delete, the footer shows only that step.

**The feed stays current without a refresh.** While the page is open and visible, it checks for changes every 30 seconds, and immediately when the reader returns to the tab. A hidden tab doesn't check, so a forgotten tab costs nothing. Changes to updates already on screen (edits, reactions, notes, and deletions) appear in place. New updates don't appear on their own, because inserting one at the top would move whatever the reader is in the middle of; instead a "1 new update" (or "3 new updates") button appears at the top of the screen, and pressing it shows them and scrolls to the top. A family member's own post appears at once. A failed check shows nothing and simply tries again at the next one. If the reader has been signed out, for example because they were removed or the community question's answer changed, the next check takes them to the gate. The wall doesn't update itself; it's current each time it's opened.

## Writing an update

Posting and editing use the same editor: a text box with a toolbar of **Bold**, *Italic*, **Link**, **Bulleted list**, and **Numbered list**, and, once photos are on, **Add photo**. Toolbar buttons are large enough to tap easily and show which formatting is on where the cursor is. The usual keyboard shortcuts work, such as Ctrl or ⌘ with B for bold. "Link" opens a small field under the toolbar for the address, with "Remove link" when the cursor is on one. Typing or pasting a web address makes it a link.

Pasting from another app or a website keeps only formatting the editor allows (paragraphs, line breaks, bold, italic, links, and lists) and drops everything else, keeping the text. Pasted images are dropped; photos are added with "Add photo."

## Posting

A family member writes the update and posts. The form has a **"Notify supporters by email"** checkbox, checked by default, so a small follow-up can go out without emailing everyone.

## Editing

A family member can edit any update in their family, including one written by another family member. Editing can change anything in the content, including adding and removing photos and changing captions. It records the edit time and never sends notifications.

## Deleting

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden, along with its reactions, its notes and the reactions on those notes, and its photos (see "Photos"), and its notes' videos are deleted from Cloudinary. When the update has notes, the confirmation says they'll be deleted too.

## Photos

Photos are available once the operator turns them on with a setting (see the README). Until then, no "Add photo" button appears and the server accepts no photos.

**Adding.** "Add photo" opens the device's photo picker for one photo, including iPhone photos, and puts it where the cursor is, as a card with the photo and a caption field. An X in the photo's upper-right corner removes it. On a device with a pointer the X appears when the photo is hovered; on a phone, where there is no hover, it stays visible. The photo uploads as soon as it's chosen, and its card shows "Uploading…" until it's done; saving waits until every photo has finished uploading. A photo over 10 MB is refused with a message saying so. Photos can't be dragged; to move one, remove it and add it again. Removing a photo deletes it permanently once the update is saved.

**Who sees them.** Photos and captions are seen by exactly the people who can see the update (see [access.md](access.md)). They never appear on the gate or in emails.

**How they're kept private.** Photos are stored privately with Cloudinary, a photo-hosting service.
- Before storing a photo, Cloudinary shrinks it to at most 1600 pixels wide and removes its embedded details, such as location and camera, so the file as taken is never kept.
- Nobody can view a stored photo without a link the server signs with the app's secret key, and the server creates those links only in the feed it sends to someone signed in to the family. A link can't be guessed or altered to show a different photo or size.
- While a photo loads, a grey box holds its place.

**Deleting.** Deleting an update, or removing a photo while editing, deletes the photo from Cloudinary as well as from the app. If Cloudinary can't be reached at that moment, the photo still disappears from the app at once (see "Stated limits" in [access.md](access.md)).

**Placeholder photos, for testing.** On test sites (previews and local development) where the operator has turned on placeholder photos with their own setting, choosing a photo uploads nothing: it is saved as a placeholder, shown as a plain grey box in a 4:3 shape with its caption beneath. Placeholders behave like photos in every other way: they count toward the six, take captions, can be removed, and count in notification subjects. The production site never accepts placeholders, whatever its settings. Where real photos are also turned on, new photos are real, and placeholders saved earlier stay grey boxes.

There is no reordering, no video, and supporters can't add photos.

## Reactions

Everyone signed in to the family can react to an update or a note: family members and supporters, including readers who haven't given a name or email. There are six reactions, shown only as emoji, with no labels: ❤️ 🤗 💪 👏 🎉 😂.

Each person has at most one reaction on a given update, and at most one on a given note. Picking a different emoji replaces it; picking the same one again removes it. Editing an update keeps its reactions and its notes' reactions.

The React button and the summary work the same way on an update and on a note.

- **A React button.** It says "React" until the viewer has reacted, then shows their emoji. On a computer, resting the pointer on it briefly opens a tray of the six emoji, which stays open while the pointer moves onto it; clicking the button opens it too. On a phone, tapping the button opens the tray. The tray floats above the button, or just below it when there isn't room above. Tapping an emoji picks it and closes the tray; the viewer's current emoji is highlighted in the tray. Pressing Escape or tapping elsewhere closes the tray. The button and emoji are large enough to tap easily, work from the keyboard, and are described for screen readers.
- **A summary** in plain text next to the React button, once anyone has reacted, such as "❤️🤗👏": up to three of the emoji used, most-used first, a little smaller than the button's emoji. Screen readers also hear how many people reacted. On a computer, resting the pointer on it shows who reacted. Tapping it shows the same list under that row, and tapping again hides it. The list has one line per person with their emoji, such as "Ana Rivera ❤️", with the viewer first as "You ❤️" and readers without a name counted at the end, as in "and 2 others."

On an update, that row is the footer's, with **Leave a note**, and for family members **Edit** and **Delete** (see "The feed"). On a note, it sits under the signature, with the time and **Delete** (see "Reacting to a note").

**Everyone who can see an update or a note sees who reacted to it.** This is a deliberate choice: the families this serves are small communities where supporters know one another, and seeing who is thinking of the family is part of the support. Only names are shown, never emails. Family members and supporters appear under the name on their record. A reader who hasn't given a name is never named, only counted; once they give a name, their earlier reaction shows it.

A removed person's reactions are neither shown nor counted, and a removed person can't react, since they can't sign in. Restoring a supporter brings their reactions back.

Reacting never asks for confirmation, and reactions send no emails or notifications. Others' new reactions appear when the page is reloaded.

## Notes

Everyone signed in to the family, family members and supporters alike, can leave notes of support on an update, and everyone signed in to the family reads every note. Sharing them is the point: the family and its support network get through this together.

A note is either a written note or a video note. It has:

- for a written note, a **body** of plain text, 1 to 1,000 characters. Line breaks are kept, and web addresses become links.
- for a video note, a **video** of up to 60 seconds, with sound, and no text (see "Video notes").
- a **color** from a fixed palette of six. A written note's card is filled with the color, and its text uses a darker shade of the same hue that meets WCAG AA contrast. A video note's card is framed in the color (see "Video notes").
- its **author**, shown by name as a signature, such as "— Ana Rivera." A family member's note is also marked "Family," so a supporter can't pass as a family member by signing with their name.
- when it was **left**

### Leaving a note

Each update's footer has a "Leave a note" button, in the same row as React. It opens a dialog with two tabs, "Written note" and "Video note," starting on "Written note," which has a text box. Below either tab are a row of the palette's colors with one chosen at random and the name, then "Leave note" for a written note or "Post" for a video. The dialog shows the note in its chosen color as it's written, and picking a different color changes it at once. "Cancel" closes the dialog and discards the note.

A note needs a name. The dialog shows "Your name": filled in and read-only for anyone who already has one, and empty for a supporter who hasn't given one. A name entered there goes on their record, so their later notes and reactions show it too, and the feed's email form later shows it the same way, filled in and read-only. The dialog never asks for an email.

A person can leave any number of notes on an update, up to 20 notes an hour across the family, written and video notes together, so one person can't flood the wall. Notes send no emails or notifications. Others' new notes appear when the page is reloaded.

### Video notes

The note dialog's "Video note" tab holds the recorder; "Written note" switches back, keeping what was written. The name and color work the same in both. The camera stays off until it's needed.

**Recording.** The recorder shows a "Start recording" button in the space where the camera view will be. Pressing it turns the camera on; the first time, the browser asks for the camera and microphone. The dialog then shows the live camera view, mirrored like a selfie, with a 3, 2, 1 countdown over it, then records. During the countdown, "Cancel countdown" leaves the camera on with a "Start recording" button below it. While recording, the dialog shows the time left out of 60 seconds and a "Stop" button. Recording stops at "Stop" or when the 60 seconds run out.

**Reviewing.** As soon as recording stops, the dialog plays the video back, unmirrored, as everyone else will see it, with "Post" and "Re-record" buttons. "Re-record" discards the video and returns to the "Start recording" button. Nothing leaves the device until "Post." "Cancel," at any point, closes the dialog and discards the video.

**Posting.** "Post" uploads the video, showing its progress, and the note appears once the upload finishes. If the upload fails, the dialog keeps the video and offers "Try again."

**Uploading instead.** The recorder also offers "Upload a video instead" for anyone whose browser can't use the camera, such as when they've refused access or are in an email app's built-in browser. It picks a video file from the device, which goes to the same review step. A video longer than 60 seconds is refused with a message saying so. If the camera can't be used, the recorder says why and offers only the upload.

**The card.** A video note's card shows a still from the video in a 16:9 landscape shape, filling the card edge to edge inside a thin frame in the note's color, with a play button over it. A video of another shape, such as one recorded upright on a phone, is shown whole and centered, and the space beside it is filled with a blurred, enlarged copy of its still, so nothing is cropped and there are no empty bars. While it plays, that blurred backdrop stays the still. Below the video, a strip in the note's color carries the signature and when it was left, as on a written note. Tapping the play button plays the video right there in the card, in the same shape, with sound and the browser's video controls, including full screen. Starting one video pauses any other that's playing. Videos never play on their own. If a video can't be shown, for example because the video host is misconfigured, its card says "This video can't be shown right now," and the rest of the page works as usual.

Video notes are stored and delivered by Cloudinary, which also converts them to a format every browser plays (see [access.md](access.md#stated-limits) for how links to them work).

### Notes beside an update

An update's notes are always shown, newest first, as colored cards: beside the update's card on a wide screen, and below it on a phone. Up to six are shown; when there are more, a "See all 14 notes" link opens the wall showing only that update's notes.

### The wall

The wall, at `/f/<slug>/wall` and linked from "Notes" beside the feed's menu, shows every note in the family, newest first, as colored cards in columns of uneven heights: one column on a phone, up to three on a computer. Each card shows the note, its signature, and when it was left. Opened from an update's "See all" link, it shows only that update's notes, under a bar that says so, naming the update by its author, date, and first line, with a "Show all notes" button that clears the filter. Everyone signed in to the family can open it; anyone else sees the gate.

### Reacting to a note

The rules, the React button, the tray, and the summary are the ones under "Reactions." They sit under the signature, with the time and Delete on that row.

### Deleting a note

The note's author, and any family member, can delete a note, after an inline confirmation. Deletion is permanent, and it deletes the note's reactions. Deleting a video note also deletes its video from Cloudinary, as does deleting the update it's on. Notes can't be edited; to change one, delete it and leave another.

A removed person's notes are neither shown nor counted, and a removed person can't leave a note, since they can't sign in. Restoring a supporter brings their notes back.

## How to help

The page at `/f/<slug>/help`, titled "How to help," lists what the family needs. Anyone signed in to the family can read it. Anyone else sees the gate.

A request has:

- a **body** of plain text, 1 to 2,000 characters. Line breaks are kept, and web addresses become links.
- how many people can take it: **1**, a **number up to 99**, or **many** (the form's "Everyone can help with this" checkbox). Right after the body's last word, in smaller, lighter text, the page shows the count in parentheses, kept together on one line (see "Who has offered").
- whether an offer needs a name: the form's **Require name** checkbox, checked by default. Unchecked suits requests like prayers or "be kind to a stranger," where anyone can offer without saying who they are.
- whether an offer needs an email: the form's **Require email** checkbox, unchecked by default, for when the family needs a way to reach whoever helps.
- an optional **date**, and an optional **time** that can be given only with a date. Both are kept exactly as typed, with no time zone, because the need happens where the family is. They show above the body in smaller, lighter text, such as "Sat, Oct 17" or "Sat, Oct 17 · 5:30 PM."

Family members add, edit, and delete requests. Only they see the form for adding one, at the top of the page under the heading "Add a Request," with the requests below it under "All Requests." The form has two parts: "What Would Help," with the description and then the date and time, and "Who Can Help," with "Everyone can help with this," "How many people are needed?", Require name, and Require email. Edit and Delete are in a ⋮ menu at the top right of each request, shown only to family members. Editing can change anything, including the checkboxes, date, and time; offers already made stay as they are. Deleting asks for confirmation on the page and removes every offer on that request. A family can have at most 100.

Requests are shown in this order:

1. Upcoming dated requests, soonest first. On the same date, one without a time comes before those with one.
2. Requests without a date, oldest first.
3. Past requests, most recently past first.

A request is past, by the clock of the device showing it, from the start of the next day when it has only a date, and from its time when it has both. A past request's text is struck through, like a covered one but without the check, and **✋ I can help with this** is hidden from anyone who hasn't offered on it. Since "past" depends on the viewer's clock, the server doesn't refuse offers on a past request.

### Offering to help

Anyone signed in can press **✋ I can help with this**. What happens next depends on the request and on what's already on the person's record:

- **A name**, when the request requires one and the person doesn't have one: pressing the button shows "Your name" on that request, the same way a note asks. The name goes on their record. A person who already has a name offers under it and can't change it here. On a request that doesn't require a name, a person without one offers without one, and a person with one still offers under it.
- **An email**, when the request requires one and the person has no email on their record: pressing the button shows "Your email," saying only the family will see it. It's kept with that offer, as a way for the family to reach them, and nowhere else: it doesn't go on their record, isn't verified, sends nothing, doesn't appear on the People page, and doesn't sign them up for notifications. Withdrawing deletes it. A person with an email on their record, verified or not, isn't asked; the family sees that one.

When both are needed, both fields show together, with a Cancel button, and pressing the button again makes the offer. Once someone has offered, the button goes away and "👍 You are helping" takes its place, whether or not the request is covered.

To withdraw, the person presses the **×** just after "You are helping." On a computer it appears when resting on that line or reaching it with the keyboard; on a touch screen it is always shown. It opens a dialog, "Need to bow out? No problem — thanks for letting us know," with **Cancel** and **Confirm**. Confirming withdraws the offer.

One offer per person per request. When a numbered request already has that many offers, another person is told someone else just took it, and nothing is stored for them. If two people take the last place at the same moment, one offer is kept. Withdrawing, or a family member removing an offer, opens the place again. Lowering the number does not remove offers already made. The request is covered once at least that many active offers exist. A "many" request never fills.

### Who has offered

The count beside the request says how many people it needs and how it stands:

- "(1 person)," "(4 people)," or "(everyone)" before anyone offers, and "(everyone)" always for a "many" request
- "(4 people, need 3 more)" once a numbered request has some offers but isn't covered
- "(4 people)" again once it is covered

A covered request's text is struck through, with a green check in front of it. The count isn't struck through.

**✋ I can help with this** is hidden from anyone who hasn't offered on a covered request.

Only family members see who offered. Under each request, they see the list of everyone who offered, with **Remove** on each name. An offer from someone without a name shows as "Someone"; once they give a name, for example on another request, it shows that name, as reactions do. Removing asks for confirmation. Supporters see the count and their own "You are helping," never anyone else's name, so offering doesn't invite comparison between supporters, while the family can still coordinate with and thank each person.

The server sends a supporter only the number of offers and whether one of them is theirs: never another person's name, email, or id, and not the email they gave with their own offer. Family members see each name, with an email beside it when there is one: the email given with the offer, or else the one on the person's record. A supporter can't add, edit, or delete a request, and can't remove someone else's offer.

A removed person's offers are hidden and don't fill a place, and a removed person can't offer. Restoring a supporter brings their offers back, which can leave a numbered request with more offers than its number.

Offering on a numbered request emails the family's other family members that someone offered to help, with a link to this page and none of the request's text. It does not email the person who offered, supporters, or removed family members. Offering again, withdrawing, a family member removing an offer, and any offer on a "many" request send nothing. The offer is kept if the email can't be sent. Others' new offers appear when the page is reloaded.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content. When the update has photos, the subject says how many, as in "Sam's Updates has a new update (2 photos)"; the photos themselves are never attached or linked.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
