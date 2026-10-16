# Implementation plan: sign in to a preview without email

## Goal

Sign in to a pull request's preview as the test family member without sending an email, so testing doesn't spend Resend's send limit. Claude opens each new PR's preview in the browser pane already signed in.

## Approach

A local script creates the sign-in link directly in the preview database and prints it. The deployed app doesn't change, so there's no bypass that could ever reach production. Only someone with the preview database's connection string, which lives only in the local `.env`, can create a link.

Previews are linked by the branch's stable address (Vercel's `-git-<branch>` alias), not each push's own address. Cookies belong to one host, so a sign-in on the branch address lasts for the life of the PR. Sign-in emails on previews already use that address (`appUrl()`).

## Steps

1. `scripts/preview.sh` looks up the branch address with `vercel inspect --format json` and prints it as the preview address. The gate check uses it too.
2. `scripts/sign-in-preview.ts` refuses a database holding any family other than the test family, the same check as `seed-preview.ts`. It finds `PREVIEW_FAMILY_EMAIL`'s family member, creates a link with `newSignInLink()`, and prints `<branch address>/f/testfamily-preview/sign-in#token=…`.
3. `npm run preview:sign-in` runs `scripts/preview.sh --sign-in`, which ends by running step 2 against the preview database with the branch address.
4. README → Deployment documents the command. Step 6 of the CLAUDE.md workflow says to open the PR's preview in the browser pane signed in. The "Hand Melissa a ready preview link" lesson records the mechanics.

## Tests

None automated. This adds no access rule to the app, and the sign-in itself uses the existing, tested `signInWithLink`. Check by hand: on this PR's preview, run the command, open the link in the browser pane, press Sign in, and confirm the family view.

## Cut for speed

- Only the test family member can sign in this way. Supporters still use the question, which sends no email.
- The created links count toward that person's limit of 5 sign-in links an hour, so emailed links can be refused right after heavy use of the script.
