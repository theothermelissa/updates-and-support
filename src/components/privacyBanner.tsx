import { STANDARD_PRIVACY_NOTICE } from "../lib/privacyNotice.js";

// The strip across the top of every page asking readers not to share what they read. text is
// the family's own wording, shown only to people signed in to it; every other page gets the
// standard wording. Placed by App and FamilyFrame only, never inside a page, so it never doubles.
export function PrivacyBanner({ text }: { text?: string | null }) {
  return (
    <div role="note" className="border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
      {text ?? STANDARD_PRIVACY_NOTICE}
    </div>
  );
}
