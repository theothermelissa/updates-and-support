# Kickoff Brief

The input for writing the first spec. It records the concept, the user stories as Melissa first wrote them, and the decisions made before the spec existed. Once `MASTER_SPEC.md` and the area specs absorb this content, this brief can be deleted.

## The concept

Families going through a sudden hard time — a diagnosis, an accident — need to keep a wide support network informed without spending their scarce energy on it. **Updates and Support** lets a family post an update once.

That is the core, must-ship-now feature. Later phases let supporters post encouraging messages to the family (visible to other supporters), and coordinate and connect with each other.

**Urgency:** the first users are a real family in a crisis right now. The goal is to ship the MVP today. Prefer the simplest solution that is safe; see "Speed and process" in `CLAUDE.md`.

## People

- **Family** — the people who post updates and manage the network.
  - **Subject** — the person the updates are about.
  - **Family Members** — others who post and manage on the Subject's behalf.
- **Supporters** — their support network

## User stories

MVP stories are marked **(MVP)**.

Supporters:

- **(MVP)** As a Supporter, I want to see the latest updates without bothering the subject.
- As a Supporter, I want to post messages of support to the subject.
- As a Supporter, I want to share my number with other supporters.
- As a Supporter, I want to record a video message and share it.
- As a Supporter, I want to offer meaningful help.
- As a Supporter, I want to be able to reach outward for support.
- As a Supporter, I want to be able to coordinate with other supporters.

Family:

- **(MVP)** As a Family, I want to be able to update all of my supporters with the latest information.
- **(MVP)** As a Family, I want to be able to edit or delete updates.
- As a Family or a Subject, I want to see the messages of support from my loved ones.
- As a Family or a Subject, I want to see a support message that I have not seen yet.
- As a Family, I want to be able to filter my support messages by supporter and time.
- As a Family, I want to be able to search for support posts via text.

## Views (work in progress)

- Log in or join screen
- Updates feed
- Post update view
- Manage supporters view
- Support wall
- Request support view
- Support post detail view

The MVP needs the first four.

## Decisions already made

- **Stack:** Node.js, Vite + React + TypeScript frontend, Postgres via Prisma.
- **Hosting:** Vercel — static frontend plus serverless functions in `api/`. Postgres is a managed Neon database through the Vercel marketplace. (GitHub Pages was ruled out: it can't run server code, and a static page talking to the database would expose its credentials.)
- **Repo:** public on GitHub, so branch protection can require CI. All secrets live in Vercel and GitHub environment settings, never in the repo.
- **Workflow:** feature branches and pull requests. A small, deliberately chosen set of unit and integration tests must pass before a PR can merge.
- **Access: unlisted, behind a community question.** Every supporter sees every update; there is no audience granularity in the MVP. The site is unlisted (not indexed, reachable only by link), and the first page is a one- or two-step questionnaire asking something only members of the family's community would know, such as "What's the mascot of the high school nearest where she lives?" The goal is that real community members get in easily while bots, crawlers, and strangers do not. Requirements that follow from it:
  - **Server-enforced.** No update content reaches the page or the API until the visitor answers correctly. A correct answer sets a signed cookie, so a supporter answers once per device.
  - **Limited guesses.** Answers like a mascot have a small set of plausible values, so wrong attempts are capped per visitor.
  - **Forgiving matching.** Ignore case, surrounding whitespace, and a leading "the", so real supporters aren't locked out by phrasing.
  - **Not indexable.** `noindex` on every page and a `robots.txt` that disallows crawling.
  - **Stated limits.** The gate stops bots and casual strangers, not a determined person: a community question's answer can often be looked up. The spec should say so plainly.
- **Spec shape:** a `spec/` directory with one `MASTER_SPEC.md` plus single-area spec files. The exact structure is the first decision of the spec session.

## What the CaringBridge scan taught us

CaringBridge is the established free tool for this. Full report: `docs/research/caringbridge.md`. Lessons that bear on the spec:

- **Sign-in is the top pain point.** The most-viewed help article by far is the password reset. Supporters should not need a password; invite links or magic links are worth weighing.
- **No tracking scripts on health content.** CaringBridge faces a lawsuit alleging analytics pixels leaked users' health conditions.
- **Families need an export.** CarePages shut down in 2017 and its users lost their journals.

## Open questions for the spec

- **Family authentication.** Supporters get in through the community question; how does a Family Member sign in to post, edit, and delete? (Neon Auth was enabled alongside the database and is one option.)
- **Manage supporters view.** With access through the community question, there may be no supporter list to manage in the MVP. Does this view stay in the MVP, change shape, or move later?
- **Changing the question.** If the answer spreads too widely, can the family change the question, and does that sign everyone out?
- **Notification.** How does a supporter learn there's a new update — email, or just checking the page?
- **One family or many.** Does the MVP support a single family's site, or several from the start?
- **Subject vs. Family Member.** Do they differ in permissions in the MVP, or only in label?
