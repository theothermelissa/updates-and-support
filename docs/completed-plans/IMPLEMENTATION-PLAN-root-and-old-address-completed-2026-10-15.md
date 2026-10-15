# Implementation Plan — Root family and old-address redirects

Implements, in `spec/access.md`:
- **Families:** the `ROOT_FAMILY_SLUG` and `FAMILY_REDIRECTS` settings.
- **Stated limits:** a family shown at the root can be found by anyone who knows the site's address.

It also removes a real family's names, which an earlier PR had committed as examples, from the spec, the rename plan, tests, and comments. One small PR, no schema change.

Melissa asked for this urgently, for the family renamed earlier the same day:
- **Root:** the family's updates at the site's root.
- **Old address:** its pre-rename address keeps working, because it had already been shared.

## Design

Both settings are environment variables, because they name real families and the repository is public.

- **`ROOT_FAMILY_SLUG`:**
  - `GET /api/root` returns the configured address, or 404.
  - `/` is that family's home page: the gate's info reports `home: "/"` for it, so its own address's home page moves to `/`.
  - Notification emails link to `/`.
  - Its other pages (sign-in, confirmation, unsubscribe, People) stay under its own address and come back to `/` when they finish.
- **`FAMILY_REDIRECTS`** (`old=new,…`):
  - `findFamilyBySlug` follows a redirect, so every API route, including one-click unsubscribe from mail apps, treats an old address as the new one.
  - `gateInfo` now includes the family's current slug. Every family page looks the family up through the gate before rendering, which also sets the tab title. A page at an old address moves to the same page at the current one, keeping the token after the "#".
  - Malformed pairs are ignored. A Map keeps names like `constructor` from colliding with object properties.
- **Sign-in:** sessions don't carry over. Session cookies are named for the address, so anyone signed in at the old address signs in again: supporters by answering the question, family members with Family sign-in.

## Tests

- **Unit:** parsing both settings, including malformed pairs and `constructor`.
- **Integration:** an old address finds its family's current record; other families are unaffected; a redirect to a missing family finds nothing. The gate's info includes the slug.
- **Prove it can fail:** with redirects ignored, the redirect test fails.

## Progress and discoveries

All implemented. `npm run typecheck`, `npm test` (118 tests), and `npm run build` pass.

**A change to the first version.** The first version showed the family at `/` but left its own address as its home. Melissa wanted `/` to be the page itself, so the family's own address and the old address now both move to `/`. The tests for the root home path and the notification link fail when the root check is removed.

**By hand, against a local server with both settings:**
- `/`, the family's own address, and the old address, with or without a trailing slash, all end at `/`, with the family's heading and tab title;
- an old confirmation link moved to the matching page at the new address with its token intact;
- one-click unsubscribe at the old address turned the supporter's notifications off.

**Two environment gotchas:**
- The container restarted between turns, which stopped local Postgres. `pg_ctlcluster 16 main start` fixed it.
- One check first ran against a stale local server that was still holding the port with the old API code. It looked like a bug until the server was restarted.
