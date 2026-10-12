// Operator script: creates a family and its family members, then prints its address.
// Usage: npm run family:create   (uses DATABASE_URL from the environment or .env)
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { getDb } from "../server/db.js";
import { appUrl } from "../server/email.js";
import { createFamily } from "../server/families.js";

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
  const displayName = await ask('Display name (e.g. "The Rivera Family"): ');
  const question = await ask("Community question: ");
  const acceptedAnswers = (await ask("Accepted answers (comma-separated): ")).split(",");

  const members: { name: string; email: string }[] = [];
  console.log("Family members (blank name to finish):");
  for (;;) {
    const name = await ask("  Name: ");
    if (!name) {
      if (members.length > 0) break;
      console.log("  At least one family member is required.");
      continue;
    }
    members.push({ name, email: await ask("  Email: ") });
  }
  rl.close();

  const family = await createFamily(getDb(), { displayName, question, acceptedAnswers, members });
  console.log(`\nCreated ${family.displayName}: ${appUrl()}/f/${family.slug}`);
  await getDb().$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
