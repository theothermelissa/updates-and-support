import { randomInt } from "node:crypto";

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// "The O'Brién Family" → "obrien-k3f9m2xq". The random suffix keeps family
// addresses from being guessed or listed.
export function makeSlug(displayName: string): string {
  const firstWord = displayName.trim().replace(/^the\s+/i, "").split(/\s+/)[0] ?? "";
  const word =
    firstWord
      .normalize("NFD")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "family";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += SUFFIX_CHARS[randomInt(SUFFIX_CHARS.length)];
  return `${word}-${suffix}`;
}
