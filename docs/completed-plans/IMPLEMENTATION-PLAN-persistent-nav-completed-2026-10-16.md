# Implementation plan: a navigation bar that stays in place

## Goal

Moving between a family's signed-in pages (Updates, How to help, Notes, People) changes only the content under the navigation bar, without a page reload. The family's name links to Updates. A link to the current page does nothing. See "One frame for a family's pages" in `spec/MASTER_SPEC.md`.

## Why it flashes today

Every nav link is a plain `<a href>`, so each click is a full page load: the browser blanks, the app boots, `FamilyPage` fetches `gate` and renders nothing until it answers, then the page fetches `me` and its own data and renders nothing until both answer. Three round trips in a row with an empty screen, and each page mounts its own `FamilyShell`.

## Approach

Client-side navigation by hand, matching `App.tsx`'s existing choice of no router dependency: `history.pushState` plus a small hook that re-renders on navigation. The family's pages share one frame that loads `me` once and stays mounted; each page renders only its content and keeps fetching its own data.

## Steps

1. **`src/navigate.ts`.** `navigate(href)` pushes the address and tells subscribers; `usePath()` returns the current path and re-renders on `navigate` and on `popstate` (Back and Forward). `followLink(event, href)` is the click handler for in-app links: it leaves the browser alone for a modified or non-left click (so ⌘-click and middle-click still open a new tab), does nothing if `href` is the current address, and otherwise prevents the default and calls `navigate`. Each navigation scrolls to the top.
2. **`App.tsx`.** Read the path from `usePath()` instead of `location.pathname`. Split `FamilyPage` so the `gate` lookup and slug redirect depend only on the slug, not the page, so moving between pages never re-runs it or blanks the screen.
3. **`FamilyFrame`** (in `familyShell.tsx`). Rendered by `FamilyPage` for the four family pages. It loads `me` once per slug; on 404 it shows Not found, and when signed out it shows the gate on Updates or replaces the address with Updates on any other page. It renders `FamilyShell` with the page's content inside, passing the page `me`, `setMe`, and `reloadMe`.
4. **`FamilyShell`.** The family's name becomes a link to Updates. Nav links, the name, and the menu's People use `followLink`. The current page's link keeps its highlighted look and `aria-current="page"`; `followLink` makes it a no-op. The `column` width setting moves to a prop the frame passes per page.
5. **Pages.** `FamilyHome`, `Help`, `Wall`, and `People` drop their own `me` fetch and `FamilyShell` wrapper and take `me` from the frame. Help's name-on-offer and FamilyHome's notification toggle update `me` through `setMe`; "Edit name" calls `reloadMe`, and each page still reloads its own data where the name shows. People's "Only family members" message renders inside the frame. A page's data request that returns 401 still replaces the address with Updates, a full load to the gate.
6. **In-content links.** The feed's "notes on this update" link to `wall#update=…` uses `followLink`; the wall reads the hash when it mounts, as it does now.
7. **Scrollbar room.** `html { scrollbar-gutter: stable }` in `src/index.css`, so a page that scrolls is no narrower than one that doesn't. Radix's scroll lock (`react-remove-scroll-bar`) adds a `margin-right` of the scrollbar's width to `body` while a menu or dialog is open, which would then count it twice; a more specific rule sets that margin to 0.

Sign out keeps its full page load (`location.assign`), so nothing from the session stays in memory afterward. Pages outside the frame (sign-in, verify, unsubscribe, family sign-in) are unchanged.

## Tests

None automated. No server code or access rule changes: every page still gets its data from the server, which enforces who sees what, and a signed-out or removed person still lands on the gate at their next request. `followLink`'s rules are a few lines of glue. Verify in the browser pane:

- The `<header>` element is the same DOM node before and after moving between all four pages (no remount), and no document load happens (`performance.getEntriesByType("navigation")` unchanged).
- Pressing the current page's link, or the family's name on Updates, changes nothing.
- The family's name goes to Updates from each other page.
- Back and Forward move between pages; the address matches the page shown.
- A ⌘-click event isn't prevented (dispatch one and check `defaultPrevented`); Melissa confirms it opens a new tab in her browser.
- "Notes on this update" opens the wall filtered to that update; "Show all notes" still clears it.
- As a supporter: How to help appears only when requests exist; People isn't in the menu.
- Signing out returns to the gate.

## Cut for speed

- **No loading indicator.** While a page fetches its data, the area under the bar is empty for a moment.
- **No scroll restoration on Back.** Back returns to the top of the previous page, not where the reader was.
- **Drafts aren't protected.** Leaving a page with an unposted update or note loses it, as a full page load does today.

## Verification results

All steps are implemented. On the PR's preview, signed in as the test family member, with the test family as the site's root family (so Updates lives at `/`): moving through Updates, How to help, Notes, and People kept the same `<header>` node and one document load throughout; the current page's link and the family's name on Updates left history unchanged; the name returned to `/` from other pages; Back and Forward showed the matching page; a ⌘-click wasn't prevented; no console errors. Not checked here: the feed's "See all notes" link (the test family has no update with enough notes), the supporter view, and signing out.
