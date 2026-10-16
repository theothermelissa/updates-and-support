# Updates and Support — Master Spec

The source of truth for what the app should be. This file covers the concept, the people, the scope, and the rules that apply everywhere. Each area of the app has its own spec, listed in the index at the end.

## Concept

Families going through a sudden hard time, such as a diagnosis or an accident, need to keep a wide support network informed without spending their scarce energy on it. **Updates and Support** lets a family post an update once for their whole support network.

The app hosts many families. Each family has its own private site, its own supporters, and its own updates, and nothing crosses between families.

## People

- **Family Member**: posts, edits, and deletes updates, and manages the family's supporters and family members. Every family member has the same permissions; the person the updates are about is simply one of the family members.
- **Supporter**: someone in the family's support network. Reads updates, reacts and leaves notes, and can get an email when a new one is posted.
- **Operator**: the person running the app (Melissa). Creates and renames families with command-line scripts. The operator is not a role inside the app.

A person who is both a supporter and a family member of different families has a separate, unrelated record in each.

## Scope

### MVP

- Operator creates and renames families with scripts. → [access.md](access.md)
- Family members sign in with magic links and can add and remove other family members. → [access.md](access.md)
- Supporters read the updates as soon as they answer the family's community question. Giving a name and email, to get notifications, is a separate, optional step. → [access.md](access.md)
- Family members add supporters directly, manage the supporter list (including verifying a supporter's email for them), and change the community question. → [access.md](access.md)
- Family members post, edit, and delete updates with simple formatting (bold, italic, strikethrough, links, and lists); everyone signed in to the family reads them in a feed that stays current without a refresh. → [updates.md](updates.md)
- Photos in updates, with optional captions, up to six per update, once the operator turns photos on; test sites can use grey placeholder photos instead. → [updates.md](updates.md#photos)
- Everyone signed in to the family can give each update and each note one reaction from a fixed set of six emoji, and sees who reacted. → [updates.md](updates.md#reactions)
- Everyone signed in to the family can leave colored notes of support on an update, written or as a video of up to 60 seconds, and reads every note under its update and together on the family's wall. → [updates.md](updates.md#notes)
- Family members post ways to help, and anyone signed in can offer to take one. A numbered request shows a check once enough people have offered. → [updates.md](updates.md#how-to-help)
- Supporters with a verified email get a notification email when a new update is posted. → [updates.md](updates.md)

### Later

These are planned but not yet specified. Each gets its own area spec when it becomes the next feature.

- Self-serve family signup, replacing the operator script.
- Export of a family's updates, so they never lose their journal if the app goes away.
- For the wall of notes: unread markers, filtering by supporter and time, text search, and editing a note.
- Supporters sharing contact details with each other, and reaching out for their own support.
- Supporters deleting their own record.

## Product-wide rules

These apply to every page, endpoint, and feature.

- **Health information is sensitive.** Update content is shown only to people signed in to that family, and only the server decides who that is. See [access.md](access.md).
- **Families are isolated.** Being signed in to one family grants nothing in another, and no page or response reveals one family's data to another family's members or supporters.
- **No third-party tracking.** No analytics, tracking pixels, ad scripts, or third-party embeds on any page. Video notes play in the browser's own video player, never Cloudinary's.
- **Everything is served from the app's own domain, except photos and video notes.** Fonts, scripts, styles, and images are bundled with the app. The exceptions are photos in updates and video notes, which Cloudinary stores and serves (see [updates.md](updates.md#photos) and [updates.md](updates.md#video-notes)); pages send it no referrer, so Cloudinary never learns which family's page a request came from.
- **Content is never inserted as HTML.** Updates are stored as a checked document and drawn by the app's own code, so nothing a family member writes or pastes can run as code on a reader's page.
- **Not indexable.** Every page sends `noindex`, and `robots.txt` disallows all crawling.
- **Emails carry no update content.** Notification and sign-in emails name the family and contain a link, nothing more, because emails are forwarded and shown in lock-screen previews. The one exception is how many photos a new update has.
- **Email is sent through Resend** from a subdomain of `orbul.com`, so deliverability problems cannot affect the root domain.

## Look and feel

The app follows the visual language of Vercel's Geist design system: the Geist Sans typeface, a quiet neutral palette, generous spacing, and plain, clearly labeled controls. Every page uses the same shared components, so new features look consistent without new design work.

- **Light mode only.**
- **Phone first.** Every page works at 360px wide without the page scrolling sideways. A wide table may scroll sideways within its own box.
- **Confirmations happen on the page.** A destructive action, such as deleting an update or removing a person, asks for confirmation with an inline "Yes / Cancel" step, never a browser dialog, because some in-app email browsers silently suppress dialogs.

## Area specs

- [access.md](access.md): families, the community question, supporter and family member sign-in, sessions, and managing people.
- [updates.md](updates.md): posting, editing, and deleting updates, photos, the feed, reactions, notes, ways to help, and notifications.
