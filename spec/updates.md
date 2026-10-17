# Updates

How a family posts updates, how everyone reads them, reacts to them, and leaves notes on them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

## An update

An update is either formatted text, with optional photos, or a video (see "Video updates"). It is never both. It has:

- its **content**, when it is text: formatted text with optional photos, in the order the family member wrote them. The formatting is deliberately small:
  - paragraphs and line breaks
  - **bold**, *italic*, and ~~strikethrough~~
  - links, to web addresses (`http:` or `https:`) and email addresses (`mailto:`)
  - bulleted and numbered lists, which can be nested
  - block quotes, which can hold paragraphs and lists, shown indented behind a grey line on the left in muted text
  - photos, each with an optional **caption** of plain text up to 300 characters (see "Photos")
- its **author**, a family member, shown by the name on their record (see [access.md](access.md#changing-your-name))
- when it was **posted**, and when it was last **edited**, if ever

There are no headings, colors, fonts, tables, code, or images from other websites. A text update can't be empty, and it has at most 20,000 characters of text, at most six photos, and lists nested at most three levels deep.

## The feed

The feed is the family's main page. Everyone signed in to the family sees every update, newest first, each showing its author, posted time, content, and an "edited" mark if it was edited. Text appears as written: formatted text, lists, quotes, and each photo at the full width of the feed with its caption, if any, beneath it. A video update shows its video instead (see "Video updates"). Links open in a new tab. An update written before formatting existed shows as it always did, with its web addresses as links.

The feed, like every page signed in to a family, sits under the family's navigation bar (see "Look and feel" in [MASTER_SPEC.md](MASTER_SPEC.md)).

Each update has a footer of actions in one row: **React** (unless the update allows no reactions; see "Reactions") and **Leave a note** for everyone signed in, and **Edit** and **Delete** as well for family members, on the right. A video update has no Edit. On a phone the row wraps rather than shrinking the buttons. Family members also see a "Post an update" button above the feed. Notes sit beside the update on a wide screen, and below it on a phone (see "Reactions" and "Notes"). While a family member is editing an update or confirming a delete, the footer shows only that step.

**The feed stays current without a refresh.** While the page is open and visible, it checks for changes every 30 seconds, and immediately when the reader returns to the tab. A hidden tab doesn't check, so a forgotten tab costs nothing. Changes to updates already on screen (edits, reactions, notes, and deletions) appear in place. New updates don't appear on their own, because inserting one at the top would move whatever the reader is in the middle of; instead a "1 new update" (or "3 new updates") button appears at the top of the screen, and pressing it shows them and scrolls to the top. A family member's own post appears at once. A failed check shows nothing and simply tries again at the next one. If the reader has been signed out, for example because they were removed or the community question's answer changed, the next check takes them to the gate. The wall doesn't update itself; it's current each time it's opened.

## Writing an update

Posting and editing use the same editor: a text box with a toolbar of **Bold**, *Italic*, ~~Strikethrough~~, **Link**, **Bulleted list**, **Numbered list**, and **Quote**, and, once photos are on, **Add photo**. Toolbar buttons are large enough to tap easily and show which formatting is on where the cursor is. The usual keyboard shortcuts work, such as Ctrl or ⌘ with B for bold, and with Shift and S for strikethrough. **Quote** quotes the line the cursor is on (or the selected lines), splitting it from the lines around it. "Link" opens a small field under the toolbar for the address, with "Remove link" when the cursor is on one. Typing or pasting a web address makes it a link, and typing `> ` at the start of a line makes it a quote.

Pasting from another app or a website keeps only formatting the editor allows (paragraphs, line breaks, bold, italic, strikethrough, links, lists, and quotes) and drops everything else, keeping the text. Pasted images are dropped; photos are added with "Add photo."

## Posting

A family member writes the update and posts. The form has two tabs, **Write** and **Video**, starting on Write. Write is the editor. Video posts a video instead (see "Video updates"). Under either tab, beside **Post**, is a **Post settings** button that opens and closes a section of settings, closed each time the form opens. Whether it's open or closed, the button shows the settings as icons after its label, so what's about to happen is visible without opening it: a bell with a check when supporters will be emailed, or a bell with a minus when they won't; then a slightly smiling face for the usual reactions, or the same face with a plus for a chosen set, including none. Screen readers hear each icon's meaning, such as "Emails supporters" or "Chosen reactions." The settings apply to either tab:

- **"Notify supporters by email,"** checked by default, so a small follow-up can go out without emailing everyone.
- **"Use the usual reactions,"** checked by default, which gives the update the six usual reactions (see "Reactions"). Unchecking it shows the whole reaction catalog as one grid, in catalog order with no group headings, with the six usual ones already selected. Above the grid, a preview of the tray shows the selected emoji as supporters will see them, or "No reactions" when none are selected; screen readers hear how many of six are chosen. Tapping an emoji selects or deselects it. Up to six can be selected; once six are, the others can't be selected until one is deselected. Zero is allowed and means the update allows no reactions. Checking the box again returns to the usual six.

Posting resets both settings to their defaults.

## Editing

A family member can edit any text update in their family, including one written by another family member. Editing can change anything in the content, including adding and removing photos and changing captions. It records the edit time and never sends notifications. The editor also has Post settings with only the reactions setting, showing the update's current reactions: "Use the usual reactions" is checked when they are exactly the usual six. Changing the reactions keeps the reactions already given (see "Reactions"). A video update can't be edited, so its reactions stay as they were posted.

## Deleting

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden, along with its reactions, its notes and the reactions on those notes, and its photos (see "Photos"). Its notes' videos, and the update's own video when it has one, are deleted from Cloudinary before the update is removed; if Cloudinary can't delete one of them, the update stays so it can be tried again. When the update has notes, the confirmation says they'll be deleted too.

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

There is no reordering, and supporters can't add photos. A video is its own kind of update (see "Video updates"), not a photo.

## Video updates

A family member can post an update that is a video instead of text. It has no text and no photos. Everyone signed in to the family sees it in the feed in place of the update's text, in the same player as a video note: a still in a 16:9 shape, shown whole over a blurred backdrop, playing in place with sound and the browser's controls. It has no note color. Starting one video pauses any other that's playing, including a video note. Videos never play on their own. If a video can't be shown, its place says "This video can't be shown right now," and the rest of the page works as usual.

The post form's Video tab holds the same recorder as a video note, so opening the tab turns the camera on and shows the live preview with "Start recording" at its bottom. "Start recording" begins a 3, 2, 1 countdown, then records until "Stop." There is no time limit. While recording, the tab shows how long the recording has run. Recording also stops if the page is hidden, and if the recording reaches 100 MB, which can still be posted. Review plays the video back unmirrored, with "Post" and "Re-record." "Re-record" discards it and returns to the live preview. Nothing uploads until "Post." "Upload a video instead" works the same way as for a note, including when the camera can't be used. A file over 100 MB is refused. A file of any length is accepted, as long as it is under 100 MB. If the upload fails, the form keeps the video and offers "Try again."

A video update can't be edited. To change it, delete it and post another. Deleting it deletes the video from Cloudinary first; if that fails, the update stays.

The wall's filter bar quotes `[Video]`, the way a photo-only update is quoted as `[Photo]`.

Videos are stored and delivered the same way as video notes (see [access.md](access.md#stated-limits)). The server refuses a video over 100 MB. One that isn't finished uploading, or that was already posted as a note or an update, is refused, and the file stays where it is.

## Reactions

Everyone signed in to the family can react to an update or a note: family members and supporters, including readers who haven't given a name or email. Reactions are shown only as emoji, with no labels.

**The catalog.** Every reaction comes from a fixed catalog in the app, with no images or data from any other service. The **usual reactions** are ❤️ 🤗 💪 👏 🎉 😂. Its order, listed here in groups for reading, is the order reactions appear everywhere; the app shows it as one list:

- **Love:** ❤️ 🧡 💛 💚 💙 💜 🤍 💖 ❤️‍🩹 🫶 🥰 😘
- **Support:** 🤗 🫂 💪 🙏 🙌 👏 👍 🤝 🤞 🫡 🕯️ 🕊️
- **Hope:** 🌻 💐 🌹 🌈 ☀️ ⭐ ✨ 🌱 🦋 🍀
- **Joy:** 🎉 🎊 😂 🤣 😊 😁 🤩 🏆 💯 🔥
- **Sad:** 😢 😭 💔 🥀 😔 🥺 🥹 😟 😮‍💨
- **Angry:** 😠 😡 🤬 🙄 😒 😩 😫 🤯 🖕
- **Dark humor:** 💀 ⚰️ 👻 🙃 🫠 😅 😬 🤡 🤦 🤷

Each emoji has a name for screen readers, such as "Red heart" or "Skull." Emoji have no skin-tone variants.

**Each update has its own set** of up to six reactions from the catalog, chosen when it's posted and, for a text update, changeable by editing it (see "Posting" and "Editing"). It's the usual six unless the family chose otherwise. An update can allow no reactions.

**Notes share one family-wide set** of up to six reactions from the catalog, chosen by family members on the People page (see [access.md](access.md#reactions-on-notes)). It's the usual six unless the family chose otherwise, and it can be empty, which allows no reactions on notes. It applies to every note, whoever wrote it.

Each person has at most one reaction on a given update, and at most one on a given note. Picking a different emoji replaces it; picking the same one again removes it. Editing an update keeps its reactions and its notes' reactions, and changing the family's note set keeps every note's reactions, including reactions with emoji no longer allowed: those stay shown and counted, but no one can pick them again. Anyone can always remove their own reaction, even when its emoji is no longer allowed.

The React button and the summary work the same way on an update and on a note.

- **A React button.** It's round and shows a heart with a plus until the viewer has reacted, then shows their emoji. On a computer, resting the pointer on it briefly opens a tray of the allowed emoji, in catalog order, which stays open while the pointer moves onto it; clicking the button opens it too. On a phone, tapping the button opens the tray. The tray floats above the button, or just below it when there isn't room above. Tapping an emoji picks it and closes the tray; the viewer's current emoji is highlighted in the tray, and is in the tray even when it's no longer allowed, so it can be removed. Pressing Escape or tapping elsewhere closes the tray. The button and emoji are large enough to tap easily, work from the keyboard, and are described for screen readers. On an update or note that allows no reactions, the button is hidden, except for a viewer who already reacted, whose button shows their emoji and opens a tray of just that one, to remove it.
- **A summary** in plain text next to the React button, once anyone has reacted, such as "❤️🤗👏": up to three of the emoji used, most-used first, with ties in catalog order, a little smaller than the button's emoji. It's shown even on an update or note that allows no reactions. Screen readers also hear how many people reacted. On a computer, resting the pointer on it shows who reacted. Tapping it shows the same list under that row, and tapping again hides it. The list has one line per person with their emoji, such as "Ana Rivera ❤️", with the viewer first as "You ❤️" and readers without a name counted at the end, as in "and 2 others."

On an update, that row is the footer's, with **Leave a note**, and for family members **Edit** and **Delete** (see "The feed"). On a note, it sits under the note, with either **Delete** and the time, or the author control holding **Delete** (see "Reacting to a note").

**The server enforces the set.** A new reaction is accepted only when its emoji is in the update's current set, or, for a note, the family's current note set. Removing one's own reaction is always accepted. Only family members choose an update's set or the family's note set.

**Everyone who can see an update or a note sees who reacted to it.** This is a deliberate choice: the families this serves are small communities where supporters know one another, and seeing who is thinking of the family is part of the support. Only names are shown, never emails. Family members and supporters appear under the name on their record. A reader who hasn't given a name is never named, only counted; once they give a name, their earlier reaction shows it, and a later change of name shows there too (see [access.md](access.md#changing-your-name)).

A removed person's reactions are neither shown nor counted, and a removed person can't react, since they can't sign in. Restoring a supporter brings their reactions back.

Reacting never asks for confirmation, and reactions send no emails or notifications. Others' new reactions appear when the page is reloaded.

## Notes

Everyone signed in to the family, family members and supporters alike, can leave notes of support on an update, and everyone signed in to the family reads every note. Sharing them is the point: the family and its support network get through this together.

A note is either a written note or a video note. It has:

- for a written note, a **body** of plain text, 1 to 1,000 characters. Line breaks are kept, and web addresses become links.
- for a video note, a **video** of up to 60 seconds, with sound, and no text (see "Video notes").
- a **color** from a fixed palette of six. A written note's card is filled with the color, and its text uses a darker shade of the same hue that meets WCAG AA contrast. A video note's card is framed in the color (see "Video notes").
- its **author**. A video note shows the author's name as a signature, such as "— Ana Rivera." A written note doesn't, because people sign their written notes themselves; its author and when it was left are behind a small author control instead (see "The written note's author"). A family member's note is always marked "Family," on the card itself, so a supporter can't pass as a family member by signing a name in their text.
- when it was **left**

### Leaving a note

Each update's footer has a round "Leave a note" button showing a speech bubble with a heart, in the same row as React. It opens a dialog with two tabs, "Written note" and "Video note," starting on "Written note," which has a text box. Below either tab are a row of the palette's colors with one chosen at random and the name, then "Leave note" for a written note or "Post" for a video. The dialog shows the note in its chosen color as it's written, and picking a different color changes it at once. "Cancel" closes the dialog and discards the note.

A note needs a name. The dialog shows "Your name", filled in with the name on their record, or empty if they haven't given one, and they can change it. Leaving the note saves that name on their record (see [access.md](access.md#changing-your-name)). Cancelling, or a note that isn't saved, leaves the name as it was. The dialog never asks for an email.

A person can leave any number of notes on an update, up to 20 notes an hour across the family, written and video notes together, so one person can't flood the wall. Notes send no emails or notifications. Others' new notes appear when the page is reloaded.

### Video notes

The note dialog's "Video note" tab holds the recorder; "Written note" switches back, keeping what was written. The name and color work the same in both. The camera is on only while the "Video note" tab is open and nothing has been recorded or chosen; switching tabs, closing the dialog, or finishing a recording turns it off.

**Recording.** Opening the tab turns the camera on; the first time, the browser asks for the camera and microphone, and until it's allowed the space where the camera view will be says "Waiting for camera access…". Once allowed, that space shows the live camera view, mirrored like a selfie, so the person can see themselves and their background before recording. Nothing is recorded yet. The recorder's controls sit over the bottom of the camera view, one at a time in the same place: "Start recording," which begins a 3, 2, 1 countdown over the view and then records; "Cancel countdown" during the countdown, which returns to the live view with "Start recording"; and "Stop" while recording. While recording, the dialog also shows the time left out of 60 seconds. Recording stops at "Stop" or when the 60 seconds run out.

**Reviewing.** As soon as recording stops, the dialog plays the video back, unmirrored, as everyone else will see it, with "Post" and "Re-record" buttons. "Re-record" discards the video and returns to the live camera view with "Start recording." Nothing leaves the device until "Post." "Cancel," at any point, closes the dialog and discards the video.

**Posting.** "Post" uploads the video, showing its progress, and the note appears once the upload finishes. If the upload fails, the dialog keeps the video and offers "Try again."

**Uploading instead.** The recorder also offers "Upload a video instead" for anyone whose browser can't use the camera, such as when they've refused access or are in an email app's built-in browser. It picks a video file from the device, which goes to the same review step. A video longer than 60 seconds is refused with a message saying so. If the camera can't be used, the recorder says why and offers only the upload.

**The card.** A video note's card shows a still from the video in a 16:9 landscape shape, filling the card edge to edge inside a thin frame in the note's color, with a play button over it. A video of another shape, such as one recorded upright on a phone, is shown whole and centered, and the space beside it is filled with a blurred, enlarged copy of its still, so nothing is cropped and there are no empty bars. While it plays, that blurred backdrop stays the still. Below the video, a strip in the note's color carries the signature, with a "Family" mark beside it for a family member's note, and when it was left. Tapping the play button plays the video right there in the card, in the same shape, with sound and the browser's video controls, including full screen. Starting one video pauses any other that's playing. Videos never play on their own. If a video can't be shown, for example because the video host is misconfigured, its card says "This video can't be shown right now," and the rest of the page works as usual.

Video notes are stored and delivered by Cloudinary, which also converts them to a format every browser plays (see [access.md](access.md#stated-limits) for how links to them work).

### Notes beside an update

An update's notes are always shown, newest first, as colored cards: beside the update's card on a wide screen, and below it on a phone. Up to six are shown; when there are more, a "See all 14 notes" link opens the wall showing only that update's notes.

On a wide screen, an update with no notes has a round "Leave a note" button beside it instead, at the top, filled with the palette's Oak color. It opens the same dialog as the footer's. A phone doesn't show it, because there notes stack below the update and an extra button under every note-less update would crowd the feed; the footer's button serves instead. The button goes away when the update's first note appears, including when that note arrives through the feed's regular check.

### The wall

The wall, at `/f/<slug>/wall` and linked from "Notes" in the navigation bar, is headed "Notes of support." It shows every note in the family, newest first, as colored cards in columns of uneven heights: one column on a phone, up to three on a computer. Each card shows the note as described under "Notes": a video note with its signature and when it was left, a written note with its author control. Opened from an update's "See all" link, it shows only that update's notes, under a bar that says so, naming the update by its author, date, and first line, with a "Show all notes" button that clears the filter. Everyone signed in to the family can open it; anyone else sees the gate.

### Reacting to a note

The rules, the React button, the tray, and the summary are the ones under "Reactions," with the family's note set: the usual six unless the family chose otherwise on the People page. Everyone signed in to the family can react to any note, supporters included. On a video note they sit under the signature, with the time and Delete on that row. On a written note they sit under the text, with the "Family" mark and the author control on that row; Delete is behind the author control.

### The written note's author

A written note's card doesn't show its author's name or the time. Its bottom row ends in a quiet "···" author control, small and muted but with a full-size tap area. On a computer, resting the pointer on it shows the author's name and when the note was left, such as "Ana Rivera · Oct 17, 2026, 3:04 PM," in the same floating style as the list of who reacted, with "Delete note" on a second line for those who may delete the note; the pointer can move onto it to press it. On a phone, tapping it shows the same lines under that row, and tapping again hides it. Screen readers hear the author and time as the control's name. A family member's note keeps its "Family" mark on the card, beside the control.

### Deleting a note

The note's author, and any family member, can delete a note, after an inline confirmation. Deletion is permanent, and it deletes the note's reactions. Deleting a video note also deletes its video from Cloudinary, as does deleting the update it's on. Notes can't be edited; to change one, delete it and leave another.

A removed person's notes are neither shown nor counted, and a removed person can't leave a note, since they can't sign in. Restoring a supporter brings their notes back.

## How to help

The page at `/f/<slug>/help`, headed "How to Help" under the navigation bar, starts with the family's message, when there is one (see "The family's message"), and lists what the family needs. Anyone signed in to the family can read it. Anyone else sees the gate.

A request has:

- a **body** of plain text, 1 to 2,000 characters. Line breaks are kept, and web addresses become links.
- how many people can take it: **1**, a **number up to 99**, or **many** (the form's "Everyone can help with this" checkbox). Right after the body's last word, in smaller, lighter text, the page shows the count in parentheses, kept together on one line (see "Who has offered").
- whether an offer needs a name: the form's **Require name** checkbox, checked by default. Unchecked suits requests like prayers or "be kind to a stranger," where anyone can offer without saying who they are.
- whether an offer needs an email: the form's **Require email** checkbox, unchecked by default, for when the family needs a way to reach whoever helps.
- whether an offer needs a phone number: the form's **Require phone** checkbox, unchecked by default, for when the family needs to call or text whoever helps.
- an optional **date**, and an optional **time** that can be given only with a date. Both are kept exactly as typed, with no time zone, because the need happens where the family is. They show above the body in smaller, lighter text, such as "Sat, Oct 17" or "Sat, Oct 17 · 5:30 PM."

Family members add, edit, and delete requests. Only they see the form for adding one, below the family's message under the heading "What Would Help," with the requests below it under "All Requests." The form starts with an unlabeled box for the description, then the date and time, then "Who Can Help," with "Everyone can help with this," "How many people are needed?", Require name, Require email, and Require phone. Edit and Delete are in a ⋮ menu at the top right of each request, shown only to family members. Editing can change anything, including the checkboxes, date, and time; offers already made stay as they are. Deleting asks for confirmation on the page and removes every offer on that request. A family can have at most 100.

Requests are shown in this order:

1. Upcoming dated requests, soonest first. On the same date, one without a time comes before those with one.
2. Requests without a date, oldest first.
3. Past requests, most recently past first.

A request is past, by the clock of the device showing it, from the start of the next day when it has only a date, and from its time when it has both. A past request's text is struck through, like a covered one but without the check, and **✋ I can help with this** is hidden from anyone who hasn't offered on it. Since "past" depends on the viewer's clock, the server doesn't refuse offers on a past request.

### The family's message

Above everything else on the page, the family can keep a message for everyone who opens it, in up to three parts, each optional:

1. **An introduction**, as plain text on the page with no box or heading of its own, such as "Thank you for your care and support! We deeply appreciate it, and are so grateful for you all."
2. **Do**, under the heading "Do:", in a shaded box: what helps, such as "Send a card" or "Drop off a meal."
3. **Don't**, under the heading "Don't:", in a shaded box: what they'd rather people not send or do, such as "Please don't send flowers, and please hold off on visits for now."

Each part is formatted text of up to 2,000 characters, with the same formatting as an update except photos (see "An update"). An empty part isn't shown, and with nothing written the page starts with the requests. A message written before the page had parts is the introduction, and one written before it could be formatted shows as it always did, with line breaks kept and web addresses as links.

Any family member can write, change, or remove the message. They see an **Edit** button at the top right of the message or, when it's empty, an **Add a message for supporters** button in its place. Either one turns the whole message into three update editors, without **Add photo**, one under the other: the introduction's, whose empty box shows the grey hint "Thank you for your care and support! We deeply appreciate it, and are so grateful for you all.", then "Do:" and "Don't:" with an editor under each. One **Save** and **Cancel** below them cover all three. Saving a part empty removes it. If two family members edit at once, the last save wins.

Everyone signed in to the family reads the message, the same as the requests. It never appears on the gate or in emails, and writing or changing it sends no emails or notifications. Others see a change when they next load the page.

Supporters see "How to help" in the navigation bar once any part of the family's message is written or there is at least one request (see "Look and feel" in [MASTER_SPEC.md](MASTER_SPEC.md)).

### Offering to help

Anyone signed in can press **✋ I can help with this**. What happens next depends on the request and on what's already on the person's record:

- **A name**, when the request requires one and the person doesn't have one: pressing the button shows "Your name" on that request, the same way a note asks. The name goes on their record. A person who already has a name offers under it and can't change it here. On a request that doesn't require a name, a person without one offers without one, and a person with one still offers under it.
- **An email**, when the request requires one and the person has no email on their record: pressing the button shows "Your email," saying only the family will see it. It's kept with that offer, as a way for the family to reach them, and nowhere else: it doesn't go on their record, isn't verified, sends nothing, doesn't appear on the People page, and doesn't sign them up for notifications. Withdrawing deletes it. A person with an email on their record, verified or not, isn't asked; the family sees that one.
- **A phone number**, when the request requires one, the person is a supporter, and they have no phone number on their record: pressing the button shows "Your phone number," saying only the family will see it. Unlike an email given here, it goes on their record (see [access.md](access.md#your-phone-number)), so it stays after they withdraw, and they can change or clear it from the menu. Family members aren't asked.

Whatever is asked for shows together on that request, and **✋ I can help with this** becomes a solid black **Confirm** button with a Cancel button beside it. Pressing Confirm makes the offer; Cancel puts the original button back. Once someone has offered, the button goes away and "👍 You are helping" takes its place, whether or not the request is covered.

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

The server sends a supporter only the number of offers and whether one of them is theirs: never another person's name, email, phone number, or id, and not the email they gave with their own offer. Family members see each name, with an email beside it when there is one: the email given with the offer, or else the one on the person's record. A supporter's phone number, when they have one on their record, shows beside it too, as a link that calls it on a phone, whether or not the request requires one. A supporter can't add, edit, or delete a request, and can't remove someone else's offer.

A removed person's offers are hidden and don't fill a place, and a removed person can't offer. Restoring a supporter brings their offers back, which can leave a numbered request with more offers than its number.

Offering on a numbered request emails the family's other family members that someone offered to help, with a link to this page and none of the request's text. It does not email the person who offered, supporters, or removed family members. Offering again, withdrawing, a family member removing an offer, and any offer on a "many" request send nothing. The offer is kept if the email can't be sent. Others' new offers appear when the page is reloaded.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content. When the update has photos, the subject says how many, as in "Sam's Updates has a new update (2 photos)"; the photos themselves are never attached or linked. When the update is a video, the subject says so, as in "Sam's Updates has a new update (video)"; the video is never attached or linked.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
