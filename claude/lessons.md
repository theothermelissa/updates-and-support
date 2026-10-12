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

### Keep secrets out of the chat

When Melissa needs to use a secret (API key, database URL), give her a command that reads it from her clipboard or environment, such as `RESEND_API_KEY="$(pbpaste)" npm run …`, and say up front not to paste it into the chat.

**Why:** service dashboards show sample code with the live key embedded, and pasting that sample to ask a question exposed a Resend key, which then had to be revoked. Claude also must not type secrets into files or commands itself.

**How to apply:** whenever a step involves a secret, give the clipboard command, warn that dashboard snippets contain the key, and ask for output with the secret checked out of it.

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

**How to apply:** prefix commands with `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH &&` (or the current v24 in `~/.nvm/versions/node`).

### Prove each access test can fail

After writing an access-rule test, remove the rule it guards, watch the test fail, and restore the rule.

**Why:** a test that passes with the rule removed guards nothing, and these tests are the main protection for health data. Removing family scoping in the auth and updates code caught exactly the intended tests.

**How to apply:** copy the file to the scratchpad before mutating it and restore from that copy. `git checkout` cannot restore a file that isn't committed yet, which nearly lost `server/auth.ts`.

### Check Vercel headers on a real deploy

`vercel dev` ignores `vercel.json` headers on pages served by Vite and overrides `Cache-Control` on functions with its own. Previews sit behind Vercel's login, so check headers on production with `curl -I`.

**Why:** headers like `X-Robots-Tag` and `Cache-Control: no-store` are privacy rules, and local dev silently shows them missing or wrong.

**How to apply:** set anything privacy-critical in code (as `familyContext` does for `Cache-Control`), and check the rest on production after merging.
