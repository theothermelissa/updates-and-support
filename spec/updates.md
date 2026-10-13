# Updates

How a family posts updates, how everyone reads them, and how supporters learn a new one is up. Who may see an update is defined in [access.md](access.md): anyone signed in to the family, as a family member or a supporter.

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

A family member can delete any update in their family after confirming. Deletion is permanent: the update is removed from the database, not hidden.

## Notifications

When an update is posted with "Notify supporters by email" checked, every supporter of the family who has a verified email, has notifications on, and has not been removed gets one email.

- The subject and body say only that there is a new update from the family, using the family's display name, with a link to the family's site. They never include any update content.
- Each email has an unsubscribe link to a page with a "Turn off notifications" button, which works without signing in. The button, rather than the link alone, keeps email security scanners that open links from unsubscribing people.
- Each email also has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, so mail apps that offer their own "Unsubscribe" button can turn notifications off in one click. Scanners don't send that request.
- Family members are not notified.
- If the emails can't be sent, the update is still posted.
