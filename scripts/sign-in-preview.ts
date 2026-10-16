// Prints a one-time sign-in link for the preview's test family member, created directly in
// the preview database so no email is sent. Run through `npm run preview:sign-in`, which
// supplies the preview database's DATABASE_URL and the branch's address as PREVIEW_URL.
import "dotenv/config";
import { newSignInLink } from "../server/auth.js";
import { getDb } from "../server/db.js";
import { normalizeEmail } from "../server/families.js";

// Also used by scripts/preview.sh and scripts/seed-preview.ts.
const TEST_SLUG = "testfamily-preview";

async function main() {
  const base = process.env.PREVIEW_URL;
  if (!base) throw new Error("Run this through `npm run preview:sign-in`.");
  const email = normalizeEmail(process.env.PREVIEW_FAMILY_EMAIL ?? "");
  const db = getDb();

  // Same guard as seed-preview.ts: any other family means this may be production.
  const others = await db.family.count({ where: { slug: { not: TEST_SLUG } } });
  if (others > 0) {
    throw new Error(`This database has ${others} other families; it may be production. Nothing was changed.`);
  }

  const person = await db.person.findFirst({
    where: { email, role: "family", removedAt: null, family: { slug: TEST_SLUG } },
  });
  if (!person) throw new Error("No test family member found. Run `npm run preview:seed` first.");

  const link = newSignInLink();
  await db.magicLink.create({ data: { personId: person.id, ...link.data } });
  console.log(`Sign in:     ${base}/f/${TEST_SLUG}/sign-in#token=${link.token}  (one use, 15 minutes)`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
