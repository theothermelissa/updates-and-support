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
| `npm run dev` | Runs the app locally, frontend and API together, via the Vercel CLI. Needs a one-time `npx vercel login` and `npx vercel link`. |
| `npm run typecheck` | Type-checks everything. |
| `npm test` | Runs all tests. |
| `npm run test:unit` | Runs the fast unit tests only. |
| `npm run test:integration` | Runs the tests that use the real test database. |
| `npm run build` | Builds the production frontend into `dist/`. |
| `npm run db:migrate` | Creates and applies a migration after editing `prisma/schema.prisma`. |

## Working on a change

1. Create a branch: `feature/...`, `fix/...`, or `chore/...`.
2. Before pushing, run `npm run typecheck` and `npm test`.
3. Open a pull request. CI must pass before it can merge, and Vercel posts a preview link on the PR.
4. Merging to `main` deploys to production.

## Deployment

Vercel deploys `main` to production and every pull request to a preview URL. The production database's connection string lives in the Vercel project's environment variables as `DATABASE_URL`.

Schema migrations are applied to production with `npm run db:deploy`, run with `DATABASE_URL` set to the production database. Run it before merging a PR that changes the schema.
