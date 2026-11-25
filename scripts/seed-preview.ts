// Ensures the preview database's two fictional test families exist, one with a community
// question and one invite-only, each with PREVIEW_FAMILY_EMAIL as its family member. Safe to
// run repeatedly. Run through `npm run preview:seed`,
// which supplies the preview database's DATABASE_URL.
import "dotenv/config";
import { getDb } from "../server/db.js";
import { isValidEmail, normalizeEmail } from "../server/families.js";

// Also used by scripts/preview.sh and scripts/sign-in-preview.ts.
const TEST_SLUG = "testfamily-preview";
const INVITE_ONLY_SLUG = "testinvite-preview";

async function main() {
  const email = normalizeEmail(process.env.PREVIEW_FAMILY_EMAIL ?? "");
  if (!isValidEmail(email)) throw new Error("Set PREVIEW_FAMILY_EMAIL in .env to your test address.");
  const db = getDb();

  // The preview database holds only fictional data. Any other family means this may be
  // pointed at production, so stop before writing anything.
  const others = await db.family.count({ where: { slug: { notIn: [TEST_SLUG, INVITE_ONLY_SLUG] } } });
  if (others > 0) {
    throw new Error(`This database has ${others} other families; it may be production. Nothing was changed.`);
  }

  const family = await db.family.upsert({
    where: { slug: TEST_SLUG },
    update: {},
    create: {
      slug: TEST_SLUG,
      displayName: "The Test Family",
      question: "What is the dog's name?",
      acceptedAnswers: ["Biscuit"],
    },
  });
  await db.person.upsert({
    where: { familyId_email: { familyId: family.id, email } },
    update: { isAdmin: true },
    create: { familyId: family.id, role: "family", isAdmin: true, name: "Test Family Member", email },
  });
  console.log(`Test family ready at /f/${TEST_SLUG} (answer: Biscuit; family member: ${email})`);

  const inviteOnly = await db.family.upsert({
    where: { slug: INVITE_ONLY_SLUG },
    update: {},
    create: {
      slug: INVITE_ONLY_SLUG,
      displayName: "The Okafor Family",
      inviteOnly: true,
      question: "",
      acceptedAnswers: [],
    },
  });
  await db.person.upsert({
    where: { familyId_email: { familyId: inviteOnly.id, email } },
    update: { isAdmin: true },
    create: { familyId: inviteOnly.id, role: "family", isAdmin: true, name: "Test Family Member", email },
  });
  console.log(`Invite-only test family ready at /f/${INVITE_ONLY_SLUG} (family member: ${email})`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
