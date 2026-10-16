# Updates and Support

A web app that lets a family going through a hard time post updates once.

What the app should do lives in `spec/`, starting with `spec/MASTER_SPEC.md`. How Claude sessions work on it lives in `CLAUDE.md`.

## Stack

- **Frontend:** Vite + React + TypeScript, in `src/`
- **API:** Vercel serverless functions in `api/`, with the logic they call in `server/`
- **Database:** Postgres via Prisma 7; schema in `prisma/schema.prisma`
- **Hosting:** Vercel, with a Neon Postgres database from the Vercel marketplace
- **Video notes:** Cloudinary stores and converts them; the browser uploads straight to it
- **CI:** GitHub Actions (`.github/workflows/ci.yml`)

## First-time setup

1. Use the pinned Node version (24):
   ```bash
   nvm install
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the local databases (uses the Homebrew Postgres on your Mac):
   ```bash
   createdb updates_dev && createdb updates_test
   ```
4. Copy `.env.example` to `.env` and replace `USER` with your Postgres user name (on your Mac, your login name).
5. Apply the schema to the dev database:
   ```bash
   npm run db:migrate
   ```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app locally at http://localhost:3000, frontend and API together, via the Vercel CLI. Emails are printed to this terminal instead of sent. Needs a one-time `npx vercel login` and `npx vercel link`. |
| `npm run typecheck` | Type-checks everything. |
| `npm test` | Runs all tests. |
| `npm run test:unit` | Runs the fast unit tests only. |
| `npm run test:integration` | Runs the tests that use the real test database. |
| `npm run build` | Builds the production frontend into `dist/`. |
| `npm run db:migrate` | Creates and applies a migration after editing `prisma/schema.prisma`. |
| `npm run family:create` | Creates a family and its family members, prompting for each detail, and prints the family's address. Uses `DATABASE_URL`. |
| `npm run family:rename` | Gives a family a new display name, address, or both, asking before changing anything. The old address stops working at once. Uses `DATABASE_URL`. |
| `npm run email:test -- you@example.com` | Sends one test email through Resend. Needs `RESEND_API_KEY` and `EMAIL_FROM` set for that command. |

## Working on a change

1. Create a branch: `feature/...`, `fix/...`, or `chore/...`.
2. Before pushing, run `npm run typecheck` and `npm test`.
3. Open a pull request. CI must pass before it can merge, and Vercel posts a preview link on the PR.
4. Merging to `main` deploys to production.

## Deployment

Vercel deploys `main` to production and every pull request to a preview URL.

**Domains:** production is `orbul.com`. The older `updates.orbul.com` stays on the project, set in Vercel → Settings → Domains to redirect to `orbul.com` with the path kept, so old links still reach the app.

**Previews share one database with no real data.** All previews use the Neon branch `preview`, which was created schema-only: it has production's tables but none of its rows. It holds a fictional test family and whatever is added while testing. Real families' data exists only in production.

**Migrations run during the Vercel build.** Vercel runs the `vercel-build` script, which applies pending migrations (`prisma migrate deploy`) before building the frontend. A PR's preview applies its migrations to the `preview` branch, and merging to `main` applies them to production. Migrations use Neon's direct connection, `DATABASE_URL_UNPOOLED`; the running app uses the pooled `DATABASE_URL`. Because production migrates before the new code is live, keep migrations backward-compatible with the code already running.

**Environment variables in Vercel:**

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Production: set by the Neon integration. Preview: set by hand to the `preview` branch's pooled and direct connection strings. |
| `RESEND_API_KEY` | A Resend API key with sending access. Production and Preview. |
| `EMAIL_FROM` | `Updates and Support <updates@mail.orbul.com>`. Production and Preview. |
| `APP_URL` | The production address, `https://orbul.com`. Production only; previews use their own deployment address. |
| `ROOT_FAMILY_SLUG` | Optional. The address of the family shown at the site's root, `/`. Production: the real family's address, kept only in Vercel. Preview: `testfamily-preview`, so each preview's root shows the test family. |
| `FAMILY_REDIRECTS` | Optional. Old family addresses that lead to current ones, as `old=new` pairs separated by commas. Production only. |
| `CLOUDINARY_URL` | The Cloudinary environment's API environment variable, `cloudinary://key:secret@cloud`, from Cloudinary → Settings → API Keys. Production and Preview. |
| `CLOUDINARY_FOLDER` | Where this app's videos go in Cloudinary: `updates-and-support/production` for Production, `updates-and-support/preview` for Preview. Keeps them apart from each other and from other projects in the same Cloudinary environment. |
| `PHOTO_PLACEHOLDERS` | Optional. `1` turns on "Add photo" with grey placeholder photos that upload nothing, for trying photos without a Cloudinary account. Preview only; production ignores it even if set. |

**Checking a pull request's preview** needs four local settings in `.env` (see `.env.example`): `PREVIEW_FAMILY_EMAIL`, the preview branch's two connection strings, and Vercel's bypass secret. Vercel keeps its own copies of the connection strings Sensitive, so they can't be pulled from there.

1. `npm run preview:seed` makes sure the test family exists on the preview database, with `PREVIEW_FAMILY_EMAIL` as its family member. Run it after a preview has finished building. It refuses to touch a database that holds any other family.
2. `npm run preview` prints the current commit's preview URL and the test family's link, and, with `VERCEL_AUTOMATION_BYPASS_SECRET` in your `.env`, checks the test family's gate through Vercel's preview login.

**Creating or recreating the preview database** (for example, after a PR with a migration is abandoned, or two open PRs change the schema):

1. In Neon, delete the `preview` branch if it exists, then create a new **schema-only** branch named `preview` from production.
2. Put its pooled and direct connection strings in Vercel's Preview `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and in `.env` as `PREVIEW_DATABASE_URL` and `PREVIEW_DATABASE_URL_UNPOOLED`.
3. `npm run preview:baseline` records `main`'s migrations as applied. A schema-only branch copies production's tables but not Prisma's record of which migrations ran, so without this the next preview build tries to create every table again.
4. Redeploy the preview, then run `npm run preview:seed`.

**Creating a family in production:** run `npm run family:create` with `DATABASE_URL` set to the production connection string from the Neon console.

**Renaming a family in production:** copy the production connection string from the Neon console and run `DATABASE_URL="$(pbpaste)" npm run family:rename`. Everyone signs in again at the new address: supporters by answering the question, family members with Family sign-in. To keep links to the old address working, add `old=new` to `FAMILY_REDIRECTS` in Vercel's Production variables and redeploy. Real family addresses go only there, never in this repository.
