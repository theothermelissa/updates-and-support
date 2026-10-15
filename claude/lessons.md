# Lessons

Lessons worth carrying between sessions. Each one states the rule, why it exists, and how to apply it. Curate this file: merge near-duplicates, and delete anything that turns out to be wrong.

## Working with Melissa

### Decide in conversation, not by menu

When helping Melissa think through a decision, have a back-and-forth and let the path emerge. Don't arrive with a pre-built list of options.

**Why:** pre-decided menus frame the problem before she's had a say in what matters, and hide the tradeoffs she'd weigh differently.

**How to apply:** surface tradeoffs, ask what she cares about, then recommend. Use `AskUserQuestion` only when the choice has genuinely narrowed to a few concrete alternatives.

### No to-dos in deliverables

When something is in scope and ready, either do it or ask in chat. Never leave a "to do later" line inside a reference document, spec, or other deliverable.

**Why:** a deliverable's job is to be clean and trustworthy at a glance. Parked to-dos leak session state into it, go stale the moment the work is done, and make the reader triage. Melissa called this the worst of the three options.

**How to apply:** real deferrals go in `NEXT-SESSION.md`; open questions go to chat. A spec may describe future features as future features; that's different from parking ready work.

### Don't codify the why behind genuine acts

Keep the felt *reason* for optional or self-motivated acts out of specs and instructions. This applies especially to Claude logs.

**Why:** stating the purpose of a genuine act turns it into an assignment, and a future session will perform the documented purpose instead of doing the authentic thing. Melissa invites Claude logs at Claude's discretion and deliberately never instructs them.

**How to apply:** if a ritual or optional act needs documenting, state only the structural facts (where it lives, that it's optional). Never describe a Claude log in terms of what it does for her, and never turn it into a required step.

### Write documents for a first-time reader

Every prose or plan document should make sense on its own, to someone who has never seen an earlier version.

**Why:** "now updated to…" or "as before" phrasing only makes sense to the author, and documents outlive the session that wrote them.

**How to apply:** when editing, rewrite affected passages so they describe the current state directly. History belongs in git and in `docs/completed-plans/`.

### Hand Melissa a ready preview link

When a PR's preview has built, run `npm run preview:seed` and `npm run preview` yourself, check the gate result, and give Melissa the test family's link with what to try. Don't send her to Neon, the terminal, or Vercel to set up a test.

**Why:** setting up each preview by hand (copying a connection string, running the family script, finding the URL) was tedious and error-prone, and she asked for it to be automated.

**How to apply:** the scripts are described in README → Deployment. Test as the family member at `PREVIEW_FAMILY_EMAIL`, and as a supporter with another `+` address of hers. A recreated preview database has a new endpoint and password, so `.env`'s `PREVIEW_DATABASE_URL*` and Vercel's Preview variables both need its new strings before `preview:baseline`. Rebuild a failed preview with `npx vercel redeploy <url> --scope theothermelissa-s-team`, because the CLI's default team is a different one.

### The community question keeps casual observers out, nothing more

Don't add friction, such as confirmation steps or forced sign-outs, to defend against someone who already knows the answer. Server-side authorization, family isolation, and access tests stay non-negotiable.

**Why:** the users are family and friends, many elderly. Melissa cut a planned confirm step and sign-out from family-side Verify: "The password isn't for security as much as it is to just keep casual observers away."

**How to apply:** when a safeguard only matters against an insider who knows the answer, propose it as an option with its cost to real users, and default to leaving it out; Remove plus changing the answer is the remedy.

### Get a second opinion on plans that touch access

Before building a plan that changes who can see or do what, have a subagent review it against the spec and the existing code for safety gaps and simplifications.

**Why:** Melissa asked for this on the supporter gate, and the review found a race that let a burst of parallel guesses skip the wrong-answer limit entirely, which the plan's author missed.

**How to apply:** give the reviewer the plan, spec, and relevant code; say which decisions are settled; ask for "must fix" versus "simplify" findings; then check each finding against the code before adopting it.

### Keep secrets out of the chat

When Melissa needs to use a secret (API key, database URL), give her a command that reads it from her clipboard or environment, such as `RESEND_API_KEY="$(pbpaste)" npm run …`, and say up front not to paste it into the chat.

**Why:** service dashboards show sample code with the live key embedded, and pasting that sample to ask a question exposed a Resend key, which then had to be revoked. Claude also must not type secrets into files or commands itself.

**How to apply:** whenever a step involves a secret, give the clipboard command, warn that dashboard snippets contain the key, and ask for output with the secret checked out of it.

### Real families' names and addresses never go in the repository

When Melissa names a real family, person, or address in chat, everything committed uses fictional stand-ins: spec examples, plans, tests, code comments, commit messages, and PR text. Real addresses go only in Vercel's settings (`ROOT_FAMILY_SLUG`, `FAMILY_REDIRECTS`) or the database.

**Why:** the repo is public. A rename PR used the real person's name, the family's surname, and their address as examples in the spec, an archived plan, tests, and a commit message. That tied a real family to its health-updates site in public, and the commit message stays in `main`'s history.

**How to apply:** before every commit and PR, grep the diff and the message for names and addresses from the conversation. Use "Sam's Updates", `for-sam`, or the Rivera and Okafor families from the test fixtures instead.

## Technical

### Keep git repos out of synced folders

Don't put a git repository inside iCloud Drive, Dropbox, or another file-sync folder.

**Why:** sync services copy `.git` internals file by file while git is writing them. In Melissa's writing vault (inside iCloud), a crashed git run left a stale `.git/index.lock` and a missing index, and the automatic commits failed silently for two months. Sync folders also churn on `node_modules`.

**How to apply:** this repo lives at `~/repos/updates-and-support`; GitHub is the backup. If git reports every file as deleted and untracked at once, check for a stale `.git/index.lock`, confirm no git process is running, move the lock aside, and run `git reset`.

### Safety nets fail silently

An automated safeguard that nobody checks will eventually stop working without anyone noticing.

**Why:** the vault's auto-commit job stopped for two months and nothing flagged it.

**How to apply:** make safeguards enforce rather than advise: CI is a *required* check on `main`, not just a status. When a session touches automation, confirm it actually ran recently.

### Use Node 24 in Claude's shell

Claude's Bash shell starts on Node 20 from nvm, while the repo needs Node 24 (`.nvmrc`). Under Node 20, `npm test` fails inside Prisma with `ERR_REQUIRE_ESM`, which looks like a broken setup but isn't.

**Why:** a session lost time suspecting `DATABASE_URL` before spotting the Node version.

**How to apply:** prefix commands with `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH &&` (or the current v24 in `~/.nvm/versions/node`). In a cloud session the shell starts on Node 22: run `. /opt/nvm/nvm.sh && nvm install 24` and prefix `/opt/nvm/versions/node/<v24>/bin` instead.

### Cloud sessions differ from Melissa's Mac

A cloud session can run the tests and its pushes build Vercel previews, but it can't read Vercel's logs or seed the preview, and its local setup starts from nothing.

**Why:** on PR #13, the first preview failed and its logs needed a Vercel login. The guess that Vercel refuses commits authored by the `claude` GitHub account was wrong: the session's next commits built normally. The preview database strings and Vercel's bypass secret live only in Melissa's local `.env`, and `vercel dev` needs a Vercel login.

**How to apply:**
- Don't name a cause for a failed preview without its logs. Give Melissa `npx vercel inspect <deployment> --logs --scope theothermelissa-s-team`, and note whether a later push built.
- Postgres 16 is installed but stopped: `pg_ctlcluster 16 main start`, create a role with a password, and point a gitignored `.env` at local databases.
- For browser checks, a small scratchpad server that runs the `api/` handlers behind Vite in middleware mode works with the Playwright install in `/opt/node-tools`.
- Prisma refuses `migrate reset` from an agent without Melissa's explicit consent. After editing an unmerged migration, apply it to a fresh `createdb` database instead.

### Prove each access test can fail

After writing an access-rule test, remove the rule it guards, watch the test fail, and restore the rule.

**Why:** a test that passes with the rule removed guards nothing, and these tests are the main protection for health data. Removing family scoping in the auth and updates code caught exactly the intended tests.

**How to apply:** copy the file to the scratchpad before mutating it and restore from that copy. `git checkout` cannot restore a file that isn't committed yet, which nearly lost `server/auth.ts`.

Three patterns hide a removed rule. A test can take a path that never reaches the rule: the check that a bad link costs no gate attempt passed with the order reversed, because it sent the *correct* answer, which never records an attempt. Next, a backstop check can mask the cleanup it backs up: removal's session and link deletion passed its test with the deletion gone, because `getSession` and `spendLink` refuse removed people anyway, so assert the cleanup directly. Last, a single concurrent race can come out right by timing alone: the family-member lock's test passed without the lock until it repeated the race 20 times. Where the rule is a lock, make the race deterministic instead: hold the lock in a test transaction, start the competing work, wait until it's queued in `pg_locks` (`queuedOrDone` in the test fixtures), then act and commit. The gate-lock tests work this way, and each one fails every time its lock is removed.

### Don't use `confirm()`, `alert()`, or `prompt()`

Ask for confirmation in the page itself, for example with inline "Yes / Cancel" buttons.

**Why:** the desktop app's browser pane suppresses JavaScript dialogs, and so do some in-app browsers in email apps, which is where family members open sign-in links. `confirm()` then returns false silently, and the action does nothing. Remove on the People page failed exactly this way in Melissa's testing.

**How to apply:** any destructive action gets an inline confirmation step. When testing in the browser pane, check the console for "Page dialog suppressed".

### `vercel dev` and previews differ from production

`vercel dev` ignores `vercel.json` headers on pages served by Vite, overrides `Cache-Control` on functions with its own, and doesn't notice newly added files in `api/` until restarted. Previews sit behind Vercel's login, whose redirect drops query strings.

**Why:** headers like `X-Robots-Tag` and `Cache-Control: no-store` are privacy rules, and local dev silently shows them missing or wrong. A new route 404ing locally looked like a code bug. Sign-in links with `?token=` failed on previews until the token moved after `#`.

**How to apply:** set anything privacy-critical in code (as `familyContext` does for `Cache-Control`) and check the rest on production with `curl -I` after merging. Restart `npm start` after adding an API file. Don't carry anything a page needs in the query string through a preview link.
