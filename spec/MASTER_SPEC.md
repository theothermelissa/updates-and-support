# Updates and Support — Master Spec

The source of truth for what the app should be. This file covers the concept, the people, the scope, and the rules that apply everywhere. Each area of the app has its own spec, listed in the index at the end.

## Concept

Families going through a sudden hard time, such as a diagnosis or an accident, need to keep a wide support network informed without spending their scarce energy on it. **Updates and Support** lets a family post an update once for their whole support network.

The app hosts many families. Each family has its own private site, its own supporters, and its own updates, and nothing crosses between families.

## People

- **Family Member**: posts, edits, and deletes updates, and manages the family's supporters and family members. Every family member has the same permissions; the person the updates are about is simply one of the family members.
- **Supporter**: someone in the family's support network. Reads updates and can get an email when a new one is posted.
- **Operator**: the person running the app (Melissa). Creates and renames families with command-line scripts. The operator is not a role inside the app.

A person who is both a supporter and a family member of different families has a separate, unrelated record in each.

## Scope

### MVP

- Operator creates and renames families with scripts. → [access.md](access.md)
- Family members sign in with magic links and can add and remove other family members. → [access.md](access.md)
- Supporters read the updates as soon as they answer the family's community question. Giving a name and email, to get notifications, is a separate, optional step. → [access.md](access.md)
- Family members add supporters directly, manage the supporter list, and change the community question. → [access.md](access.md)
- Family members post, edit, and delete text updates; everyone signed in to the family reads them in a feed. → [updates.md](updates.md)
- Supporters with a verified email get a notification email when a new update is posted. → [updates.md](updates.md)

### Later

These are planned but not yet specified. Each gets its own area spec when it becomes the next feature.

- Self-serve family signup, replacing the operator script.
- Photos in updates.
- Export of a family's updates, so they never lose their journal if the app goes away.
- Supporter messages of support to the family, visible to other supporters (the support wall), including unread markers, filtering by supporter and time, and text search for the family.
- Video messages from supporters.
- Ways for supporters to offer meaningful help, coordinate with each other, share contact details, and reach out for their own support.
- Supporters deleting their own record.

## Product-wide rules

These apply to every page, endpoint, and feature.

- **Health information is sensitive.** Update content is shown only to people signed in to that family, and only the server decides who that is. See [access.md](access.md).
- **Families are isolated.** Being signed in to one family grants nothing in another, and no page or response reveals one family's data to another family's members or supporters.
- **No third-party tracking.** No analytics, tracking pixels, ad scripts, or third-party embeds on any page.
- **Not indexable.** Every page sends `noindex`, and `robots.txt` disallows all crawling.
- **Emails carry no update content.** Notification and sign-in emails name the family and contain a link, nothing more, because emails are forwarded and shown in lock-screen previews.
- **Email is sent through Resend** from a subdomain of `orbul.com`, so deliverability problems cannot affect the root domain.

## Area specs

- [access.md](access.md): families, the community question, supporter and family member sign-in, sessions, and managing people.
- [updates.md](updates.md): posting, editing, and deleting updates, the feed, and notifications.
