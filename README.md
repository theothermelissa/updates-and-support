# Updates and Support

A web app that lets a family going through a hard time post updates once.

What the app should do lives in `spec/`, starting with `spec/MASTER_SPEC.md`. How Claude sessions work on it lives in `CLAUDE.md`.

## Stack

- **Frontend:** Vite + React + TypeScript, in `src/`
- **API:** Vercel serverless functions in `api/`, with the logic they call in `server/`
- **Database:** Postgres via Prisma 7; schema in `prisma/schema.prisma`
- **Hosting:** Vercel, with a Neon Postgres database from the Vercel marketplace
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
| `npm run email:test -- you@example.com` | Sends one test email through Resend. Needs `RESEND_API_KEY` and `EMAIL_FROM` set for that command. |

## Working on a change

1. Create a branch: `feature/...`, `fix/...`, or `chore/...`.
2. Before pushing, run `npm run typecheck` and `npm test`.
3. Open a pull request. CI must pass before it can merge, and Vercel posts a preview link on the PR.
4. Merging to `main` deploys to production.

## Deployment

Vercel deploys `main` to production and every pull request to a preview URL.

**Previews share one database with no real data.** All previews use the Neon branch `preview`, which was created schema-only: it has production's tables but none of its rows. It holds a fictional test family and whatever is added while testing. Real families' data exists only in production.

**Migrations run during the Vercel build.** Vercel runs the `vercel-build` script, which applies pending migrations (`prisma migrate deploy`) before building the frontend. A PR's preview applies its migrations to the `preview` branch, and merging to `main` applies them to production. Migrations use Neon's direct connection, `DATABASE_URL_UNPOOLED`; the running app uses the pooled `DATABASE_URL`. Because production migrates before the new code is live, keep migrations backward-compatible with the code already running.

**Environment variables in Vercel:**

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Production: set by the Neon integration. Preview: set by hand to the `preview` branch's pooled and direct connection strings. |
| `RESEND_API_KEY` | A Resend API key with sending access. Production and Preview. |
| `EMAIL_FROM` | `Updates and Support <updates@mail.orbul.com>`. Production and Preview. |
| `APP_URL` | The production address. Production only; previews use their own deployment address. |

**Checking a pull request's preview:**

1. `npm run preview:seed` makes sure the test family exists on the preview database, with `PREVIEW_FAMILY_EMAIL` from your `.env` as its family member. Run it after a preview has finished building. It refuses to touch a database that holds any other family.
2. `npm run preview` prints the current commit's preview URL and the test family's link, and, with `VERCEL_AUTOMATION_BYPASS_SECRET` in your `.env`, checks the test family's gate through Vercel's preview login.

**When the preview database gets out of step** (for example, after a PR with a migration is abandoned, or two open PRs change the schema): in Neon, delete the `preview` branch, create a new schema-only `preview` branch from production, update the two Preview variables in Vercel, redeploy, and run `npm run preview:seed`.

**Creating a family in production:** run `npm run family:create` with `DATABASE_URL` set to the production connection string from the Neon console.
