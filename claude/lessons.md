# Lessons

Lessons worth carrying between sessions. Each one states the rule, why it exists, and how to apply it. Curate this file: merge near-duplicates, and delete anything that turns out to be wrong.

## Working with Melissa

### Don't codify the why behind genuine acts

Keep the felt *reason* for optional or self-motivated acts out of specs and instructions. This applies especially to Claude logs.

**Why:** stating the purpose of a genuine act turns it into an assignment, and a future session will perform the documented purpose instead of doing the authentic thing. Melissa invites Claude logs at Claude's discretion and deliberately never instructs them.

**How to apply:** if a ritual or optional act needs documenting, state only the structural facts (where it lives, that it's optional). Never describe a Claude log in terms of what it does for her, and never turn it into a required step.

### Hand Melissa a ready preview link

When a PR's preview has built, run `npm run preview:seed` and `npm run preview` yourself, check the gate result, and give Melissa the test family's link with what to try. Don't send her to Neon, the terminal, or Vercel to set up a test.

**Why:** setting up each preview by hand (copying a connection string, running the family script, finding the URL) was tedious and error-prone, and she asked for it to be automated.

**How to apply:** the scripts are described in README → Deployment. `npm run preview` prints the branch's stable address, which always shows the latest push; send that one, not a push's own address. To sign the browser pane in as the family member, run `npm run preview:sign-in` and navigate the pane to the printed link, then press Sign in; the pane stays signed in on that address for the whole PR. The pane must be signed in to Vercel first. Never put a sign-in link in a PR description or commit. Test as the family member at `PREVIEW_FAMILY_EMAIL`, and as a supporter with another `+` address of hers. A recreated preview database has a new endpoint and password, so `.env`'s `PREVIEW_DATABASE_URL*` and Vercel's Preview variables both need its new strings before `preview:baseline`. Rebuild a failed preview with `npx vercel redeploy <url> --scope theothermelissa-s-team`, because the CLI's default team is a different one.

## Technical

### Keep git repos out of synced folders

Don't put a git repository inside iCloud Drive, Dropbox, or another file-sync folder.

**Why:** sync services copy `.git` internals file by file while git is writing them. In Melissa's writing vault (inside iCloud), a crashed git run left a stale `.git/index.lock` and a missing index, and the automatic commits failed silently for two months. Sync folders also churn on `node_modules`.

**How to apply:** this repo lives at `~/repos/updates-and-support`; GitHub is the backup. If git reports every file as deleted and untracked at once, check for a stale `.git/index.lock`, confirm no git process is running, move the lock aside, and run `git reset`.

### Safety nets fail silently

An automated safeguard that nobody checks will eventually stop working without anyone noticing.

**Why:** the vault's auto-commit job stopped for two months and nothing flagged it.

**How to apply:** make safeguards enforce rather than advise: CI is a *required* check on `main`, not just a status. When a session touches automation, confirm it actually ran recently.

### Commands that fail in an agent's shell

Some routine commands refuse to run or error out from an agent, which can look like a real problem.

**Why:** on the reactions PR, `prisma migrate dev --create-only` refused to run without an interactive terminal, and `gh pr edit` failed on a GitHub Projects (classic) deprecation error.

**How to apply:**
- Write the migration SQL by hand in a new `prisma/migrations/<timestamp>_<name>/` folder, named to sort after the newest existing one (their timestamps can be ahead of today). To confirm there's no drift, create a scratch database with the test database's credentials, `prisma migrate deploy` to it, and run `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` pointed at it; `--from-migrations` needs a shadow database this config doesn't set.
- If a commit lands on the wrong branch (another session switched this folder), point the right branch at it with `git branch -f <branch> <sha>`, then ask Melissa to reset the wrong branch, since auto mode blocks `git reset` on `main`.
- Edit a PR body with `gh api -X PATCH repos/theothermelissa/updates-and-support/pulls/<n> -F body=@file`.

### Testing locally on Melissa's Mac

The local database holds several families, so `scripts/seed-preview.ts` refuses to run against it. It also falls behind `main`'s migrations.

**Why:** on the live feed, the local feed returned 500 errors because the photos migration had never been applied there, and the seed script stopped itself.

**How to apply:**
- Run `npm run db:deploy` first.
- Make a fictional family by piping answers into `npm run family:create`.
- To act as a family member without a sign-in email, write a scratchpad `.mts` script that calls the `server/` functions with absolute imports, and run it with `npx tsx --env-file=.env`. One that creates a `sign_in` link with `newSignInLink` and prints its `/sign-in#token=` URL uses the real flow; the page then needs its Sign in button pressed.
- Before minting a sign-in link, open the family page in the browser pane: it keeps sessions between runs, and auto mode refuses to read a minted link's token back.
- To be a family member and a supporter at once, open one tab on `localhost` and the other on `127.0.0.1`: cookies are per host, so the two sessions don't replace each other.
- To work on another branch while this checkout has uncommitted work, use `git worktree add` in `~/repos/`, copy `.env` and `.vercel` into it, run `npm ci` and `npx prisma generate` (npm skips Prisma's install scripts), and start it on its own port.

### Cloud sessions differ from Melissa's Mac

A cloud session can run the tests and its pushes build Vercel previews, but it can't read Vercel's logs or seed the preview, and its local setup starts from nothing.

**Why:** on PR #13, the first preview failed and its logs needed a Vercel login. The guess that Vercel refuses commits authored by the `claude` GitHub account was wrong: the session's next commits built normally. The preview database strings and Vercel's bypass secret live only in Melissa's local `.env`, and `vercel dev` needs a Vercel login.

**How to apply:**
- Don't name a cause for a failed preview without its logs. Give Melissa `npx vercel inspect <deployment> --logs --scope theothermelissa-s-team`, and note whether a later push built.
- The shell starts on Node 22: run `. /opt/nvm/nvm.sh && nvm install 24` and prefix `/opt/nvm/versions/node/<v24>/bin`. If there is no nvm v24, look under `~/.local/share/mise/installs/node/`. If `nvm install` exits silently with code 3, download `node-v24.<x>-linux-x64.tar.xz` from `nodejs.org/dist` and unpack it into `~/.local/node24`.
- Postgres 16 is installed but stopped: `pg_ctlcluster 16 main start`, create a role with a password, and point a gitignored `.env` at local databases.
- For browser checks, a small scratchpad server that runs the `api/` handlers behind Vite in middleware mode works with the Playwright install in `/opt/node-tools` (launch with `executablePath: '/opt/pw-browsers/chromium'`). The scratchpad is outside the repo, so import Vite by its absolute path in `node_modules`. Set `VERCEL_ENV=development` so session cookies work over plain http, and sign a family member in by creating a session row and setting its `session_<slug>` cookie in the browser context. While a Radix menu is open, it hides the rest of the page from role queries, so measure the page before opening it. Radix moves focus on the tick after an arrow key, so wait briefly before checking focus.
- Prisma refuses `migrate reset` from an agent without Melissa's explicit consent. After editing an unmerged migration, apply it to a fresh `createdb` database instead.

### Patterns that hide a removed access rule

CLAUDE.md requires proving each access test fails with its rule removed. Three patterns hide a removed rule. A test can take a path that never reaches the rule: the check that a bad link costs no gate attempt passed with the order reversed, because it sent the *correct* answer, which never records an attempt. Next, a backstop check can mask the cleanup it backs up: removal's session and link deletion passed its test with the deletion gone, because `getSession` and `spendLink` refuse removed people anyway, so assert the cleanup directly. Last, a single concurrent race can come out right by timing alone: the family-member lock's test passed without the lock until it repeated the race 20 times. Where the rule is a lock, make the race deterministic instead: hold the lock in a test transaction, start the competing work, wait until it's queued in `pg_locks` (`queuedOrDone` in the test fixtures), then act and commit. The gate-lock tests work this way, and each one fails every time its lock is removed. Holding the lock in the test doesn't work when the unfixed code would also block on it, for example at a foreign-key check on a row the test locked; then pause the code mid-transaction instead, with a Prisma query extension that waits after the step in question (the magic-link removal race in `tests/integration/auth.test.ts`).

### The local test database is shared between sessions

Every worktree's `.env` points `TEST_DATABASE_URL` at the same local database, and `global-setup.ts` runs `migrate deploy` against it. So a session on a branch with a newer migration leaves it ahead of every other branch.

**Why:** on the note author PR, 20 reaction tests failed with `type "public.ReactionKind" does not exist` because another session's unmerged migration had changed that column to text. The PR's own code was fine.

**How to apply:** when integration tests fail in code the branch didn't touch, compare `_prisma_migrations` with `prisma/migrations`. Then run the suite against a throwaway database: `createdb`, point `TEST_DATABASE_URL` at it for that one command, and `dropdb` afterward.

### `vercel dev` and previews differ from production

`vercel dev` ignores `vercel.json` headers on pages served by Vite, overrides `Cache-Control` on functions with its own, and doesn't notice newly added files in `api/` until restarted. Previews sit behind Vercel's login, whose redirect drops query strings.

**Why:** headers like `X-Robots-Tag` and `Cache-Control: no-store` are privacy rules, and local dev silently shows them missing or wrong. A new route 404ing locally looked like a code bug. Sign-in links with `?token=` failed on previews until the token moved after `#`.

**How to apply:** set anything privacy-critical in code (as `familyContext` does for `Cache-Control`) and check the rest on production with `curl -I` after merging. Restart `npm start` after adding an API file. Don't carry anything a page needs in the query string through a preview link.

### Merging `main` can delete the branch's plan

When `main` archived its own `IMPLEMENTATION-PLAN.md` while a branch had a different one, merging `main` into the branch staged a deletion of the branch's plan without a conflict.

**Why:** both sides started from the same file, and git applied `main`'s delete. The notes plan vanished mid-merge and had to be restored.

**How to apply:** after merging `main`, check `git status` for `D  IMPLEMENTATION-PLAN.md` and restore it with `git checkout HEAD -- IMPLEMENTATION-PLAN.md` before committing.

### Browser-pane quirks that look like app bugs

With a custom viewport size set, the pane's screenshots can show a stale frame for several captures, or none at all when the tab isn't fronted.

**Why:** while checking the wall's filter, screenshots showed the unfiltered page while the DOM had already updated. That nearly passed as a bug.

**How to apply:** confirm state with `javascript_tool` or `read_page`, front the tab with `tabs_select`, and clear the emulation before taking the screenshot you share. The pane's `hover` action doesn't trigger CSS `:hover`, so check hover-only controls by keyboard focus there and ask Melissa to hover in her own browser. The pane can't type into native date and time inputs; set them with `form_input` on the input's ref. The pane also doesn't let pages go full screen, so a video's full-screen button doing nothing there is the pane, not the app; check in a real browser before debugging it. Clicking several React-controlled buttons in one synchronous `javascript_tool` script keeps only the last toggle, because each click sees the same pre-render state; await a short delay between clicks. Melissa may be using the pane at the same time: if an editor's content changes under you (text you didn't type appears, yours vanishes), stop driving the page and hand it to her rather than saving.

### Testing video notes in the browser pane

The pane blocks the camera, so only the refused-camera path of the recorder can be tested there. Uploads can be: copy a test video into `public/` temporarily, then in `javascript_tool` fetch it, wrap it in a `File`, set it on the hidden `input[type=file]` with a `DataTransfer`, and dispatch `change`. Delete the file from `public/` afterward. This machine has no ffmpeg; a short Swift script using `AVAssetWriter` makes labeled test videos of any shape.

**Why:** checking how odd-shaped videos display needed a 9:16 file and a way to pick it without a file dialog.

**How to apply:** leave the live camera, countdown, and Re-record to Melissa's own browser, and say so. Chrome allows the camera on `http://localhost`, so a local server plus a sign-in link she opens in Chrome works as well as a preview.

### Don't run prettier

The repo has no prettier config, and default prettier reformats whole files to 80 columns. Match the surrounding style by hand.

### Tailwind v4 spaces every child but the last

`space-y-*` and `space-x-*` put their margin on every child except the last one. An absolutely positioned decoration added as a last child still counts, so it gives the real last child a stray margin.

**Why:** a note card's tail, added inside the card, put 12px of extra space under the React row.

**How to apply:** put decorations beside a spaced container, in a wrapper, not inside it.
