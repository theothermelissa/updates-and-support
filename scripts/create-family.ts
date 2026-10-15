// Operator script: creates a family and its family members, then prints its address.
// Usage: npm run family:create   (uses DATABASE_URL from the environment or .env)
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { getDb } from "../server/db.js";
import { createFamily } from "../server/families.js";

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

// Asks until the answer is non-empty.
async function askRequired(prompt: string): Promise<string> {
  for (;;) {
    const answer = await ask(prompt);
    if (answer) return answer;
    console.log("  This is required.");
  }
}

async function main() {
  const displayName = await askRequired(`Display name (e.g. "Sam's Updates" or "The Rivera Family"): `);
  const question = await askRequired("Community question: ");
  const acceptedAnswers = (await askRequired("Accepted answers (comma-separated): ")).split(",");

  const members: { name: string; email: string }[] = [];
  console.log("Family members (blank name to finish):");
  for (;;) {
    const name = await ask("  Name: ");
    if (!name) {
      if (members.length > 0) break;
      console.log("  At least one family member is required.");
      continue;
    }
    members.push({ name, email: await askRequired("  Email: ") });
  }
  rl.close();

  console.log("\nCreating the family…");
  const family = await createFamily(getDb(), { displayName, question, acceptedAnswers, members });
  // The script can't tell which site uses this database, so it prints the path.
  console.log(`\nCreated ${family.displayName} at /f/${family.slug}`);
  console.log(`Production address: ${PRODUCTION_URL}/f/${family.slug}`);
  await getDb().$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
