// Operator script: gives a family a new display name, a new address, or both, then prints
// the new address. Asks before changing anything.
// Usage: npm run family:rename   (uses DATABASE_URL from the environment or .env)
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { getDb } from "../server/db.js";
import { findFamilyBySlug, renameFamily } from "../server/families.js";

const PRODUCTION_URL = "https://orbul.com";

const rl = createInterface({ input: process.stdin });
// An iterator rather than rl.question, so piped input works as well as typing.
const lines = rl[Symbol.asyncIterator]();

async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const line = await lines.next();
  if (line.done) throw new Error("Input ended early");
  return line.value.trim();
}

async function main() {
  const db = getDb();
  const current = await ask("Current address (the part after /f/): ");
  const family = await findFamilyBySlug(db, current);
  if (!family) throw new Error(`No family at /f/${current}.`);
  console.log(`Found ${family.displayName} at /f/${family.slug}.`);

  const displayName = (await ask(`New display name (Enter keeps "${family.displayName}"): `)) || family.displayName;
  const slug = (await ask(`New address (Enter keeps "${family.slug}"): `)) || family.slug;
  if (slug !== family.slug) {
    console.log(
      `\nThe old address /f/${family.slug} will stop working at once: links already shared will show "not found," and everyone signs in again at the new address.`,
    );
  }
  const confirm = await ask(`Rename to ${displayName} at /f/${slug.toLowerCase()}? (yes/no) `);
  rl.close();
  if (confirm.toLowerCase() !== "yes") {
    console.log("Nothing changed.");
    return db.$disconnect();
  }

  const renamed = await renameFamily(db, family.slug, { displayName, slug });
  // The script can't tell which site uses this database, so it prints the path.
  console.log(`\nRenamed to ${renamed.displayName} at /f/${renamed.slug}`);
  console.log(`Production address: ${PRODUCTION_URL}/f/${renamed.slug}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
