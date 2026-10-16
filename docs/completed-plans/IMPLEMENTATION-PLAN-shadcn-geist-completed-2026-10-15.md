# Implementation Plan: Geist Look with shadcn/ui

Restyles every page to the spec's "Look and feel" section by building the UI on shadcn/ui, Tailwind CSS, and the Geist Sans font. When it lands, the app looks consistent and works at phone width, and later features (action menus, toasts) can be built from the same components.

Spec sections covered: `spec/MASTER_SPEC.md` → Look and feel; Product-wide rules → Everything is served from the app's own domain.

## How to read this plan

Milestones run in order, and each ends with a **Verify** step. Mark each `✅` when it passes. Nothing here changes who can see or do what, so there are no new integration tests; the existing suite must keep passing, and the UI is verified in the browser pane.

## Design

### Tooling

- **Tailwind CSS v4** through its Vite plugin (`@tailwindcss/vite`). No `tailwind.config` file: v4 reads the theme from CSS.
- **shadcn/ui**, set up with its CLI (`npx shadcn init`, neutral base color). The CLI writes `components.json`, `src/lib/utils.ts` (the `cn()` class-merging helper), and the theme variables into `src/index.css`. Components are added one at a time with `npx shadcn add <name>` and land in `src/components/ui/` as our own code.
- **Geist Sans** from `@fontsource-variable/geist`, imported in `src/index.css`. Vite bundles the font files into the build, so they're served from our domain. The `geist` npm package isn't usable here because it requires Next.js.
- **Path alias `@/` → `src/`**, which shadcn's generated imports use. It goes in `tsconfig.json` `paths` and in `vite.config.ts` `resolve.alias`. TypeScript 7 has dropped `baseUrl`, so `paths` entries are written relative to the tsconfig (`"@/*": ["./src/*"]`); if the CLI adds `baseUrl`, remove it.

### New dependencies

Each one is justified in the PR description.

- `tailwindcss`, `@tailwindcss/vite`: styling.
- `@fontsource-variable/geist`: the self-hosted font.
- Added by shadcn as components need them: `clsx`, `tailwind-merge`, `class-variance-authority` (component variants), `lucide-react` (icons), `tw-animate-css`, and one `@radix-ui/*` package per interactive component (for this slice, only the checkbox and label).

### Components for this slice

`button`, `input`, `textarea`, `label`, `checkbox`, `card`, `table`, `alert`. The action menu (`dropdown-menu`) and toasts (`sonner`) arrive with the features that use them.

### Page layout

A small `src/components/PageShell.tsx` gives every page the same frame: centered column (`max-w-2xl`), `px-4` gutters, and a header slot for the family name and its links (Sign out, People). Pages keep their logic and swap raw elements for components.

### Theme

Stock shadcn neutral theme, which is effectively Geist's palette. Warming it later is a change to a few CSS variables in `src/index.css`.

## Milestones

### 1. Tooling and theme ✅

- Install Tailwind and the font; add the `@/` alias; run `npx shadcn init`.
- Import `src/index.css` in `src/main.tsx`; set `--font-sans` to Geist in the theme.
- Remove the inline `<style>` block from `index.html` (its rules move to Tailwind).
- Add the components listed above.

**Verify:** `npm run typecheck`, `npm test`, and `npm run build` pass. The app loads in the browser pane with Geist text, and the network panel shows the font coming from our own origin and no requests to any other host.

### 2. Shell and simple pages ✅

Add `PageShell`, then restyle `NotFound`, `Gate`, `SignIn`, `FamilySignIn`, `Verify`, and `Unsubscribe`: cards for forms, `Label` + `Input` pairs, `Button` for actions, `Alert` (destructive variant) for errors in place of `.error`.

**Verify:** each page at 360px and desktop width in the browser pane: readable, no sideways scroll, errors visible.

### 3. Family home and feed ✅

Restyle `FamilyHome` (header, notification toggle with `Checkbox`, email prompt) and `Feed` (post form, each update as a card, Edit/Delete buttons).

Feed's Delete currently uses `confirm()`, which in-app email browsers suppress, so deleting silently does nothing there. It becomes an inline "Delete this update? This can't be undone. [Yes, delete] [Cancel]" step, matching the People page. This is the only behavior change in the plan.

**Verify:** as a family member, post, edit, and delete (inline confirm) an update; as a supporter, read the feed, give an email, and toggle notifications. Check at 360px and desktop width.

### 4. People page ✅

Restyle the forms and both tables with `Table`. Fix the phone-width overflow: the question input and answers textarea become full-width components, so the page itself never scrolls sideways (the tables keep their own scroll box).

**Verify:** at 360px, no page-level sideways scroll. Add and remove a supporter and a family member, change the question, and check every inline confirmation still works.

### 5. Ship

Run `npm run typecheck` and `npm test`, open the PR, confirm CI, run `npm run preview:seed` and `npm run preview`, and hand Melissa the preview link with what to check.

## Discoveries

- shadcn's CLI now offers named presets; **Nova** ("Lucide / Geist") is the Geist-based one and already sets Geist Variable as the sans font, so no separate font wiring was needed.
- The CLI installs `cn`, shadcn's own package that replaces `clsx` + `tailwind-merge`, and `radix-ui`, a single package bundling all Radix primitives (tree-shaken at build).
- `npm audit` flags `fast-glob`/`micromatch` under the `shadcn` CLI. That's a dev-only tool that never ships to the browser.
- The People page's inline confirmations sat inside table rows, which scroll sideways on phones and could hide the "Yes" button off-screen. A shared `Confirm` component now shows every confirmation below its table or inside its card.
- The global link underline would also underline buttons rendered as links, so it applies only to `a:not([data-slot])`.
- Verified locally in the browser pane at 375px and desktop width: gate (wrong answer), family sign-in by link, post, inline delete, People tables and confirmations, incomplete-link errors. The font loads from our own origin, and there are no requests to other hosts.

## Cut for speed

- **Dark mode.** shadcn's theme supports it, but every page would need checking twice. Logged in `NEXT-SESSION.md`.
- **A warmer palette.** Stock neutral ships first; tuning it is a CSS-variable change.
- **Moving People page messages next to their forms.** Toasts, coming with the next features, are the natural fix, so that backlog entry waits for them.
- **Action menus and toasts themselves.** They come with the features that need them.
