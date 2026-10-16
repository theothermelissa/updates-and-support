# Implementation Plan — Feed header menu

Implements the menu in `spec/updates.md` → The feed. One small PR, no server changes, no new dependencies.

## Design

- **`src/components/ui/dropdown-menu.tsx`:** shadcn's dropdown menu, built on the `radix-ui` package already installed. It's written by hand in the style of the existing components, because the shadcn registry can't be reached from the cloud session. Only the parts used: menu, trigger, content, item, label, separator.
- **Feed header (`FamilyHome`):**
  - A ghost icon button with Lucide's `MenuIcon`, labeled "Menu" for screen readers. It's muted until hovered, so it stays subtle, and replaces the People and Sign out buttons.
  - The menu opens aligned to its right edge.
  - Items: "Signed in as {name}" as a label (only when the person has a name), then People (family members only), then Sign out.
- **Page body:** the "Signed in as …" line moves into the menu. The notifications setting and the email prompt stay where they are.
- **`PageShell`:** the header keeps its actions at the top right even beside a long title. The title wraps instead of pushing the actions to a new line.

## Tests

UI only, so no new automated tests; the existing suite must keep passing.

**By hand in Chromium, at 360px and desktop width:**
- As a family member: the menu shows the name, People, and Sign out.
- As a supporter with no name: the menu shows only Sign out.
- Sign out returns to the gate, and People opens the People page.
- A long family name doesn't push the menu off the top right, and the page doesn't scroll sideways.

## Cut for speed

Nothing.

## Progress and discoveries

All steps are done, built as designed.

Checked by hand in Chromium at 360px and 1280px, against a local server with fictional families:
- A reader without a name sees only Sign out. A supporter who gave a name sees it and Sign out. A family member sees their name, People, and Sign out.
- People opens the People page. Sign out, by mouse or keyboard, returns to the gate.
- Arrow keys move between items, and Escape closes the menu and returns focus to the button.
- The button is muted gray until hovered or open.
- A family name wrapping to three lines keeps the button level with its first line, with no sideways scroll.
- The People page's "Back to updates" button still sits level with its title.
