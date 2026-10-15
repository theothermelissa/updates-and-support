// One-time operator script: emails a verification link to every supporter who hasn't
// verified their email, so they can receive notifications. Asks before sending.
// Usage: DATABASE_URL=... npm run verification:send
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { getDb } from "../server/db.js";
import { sendEmails } from "../server/email.js";
import { sendVerifications, unverifiedSupporters } from "../server/notifications.js";

// Links always point at production; the local APP_URL is localhost.
const PRODUCTION_URL = "https://orbul.com";

async function main() {
  const db = getDb();
  const people = await unverifiedSupporters(db);
  const families = new Set(people.map((p) => p.family.displayName));
  console.log(`${people.length} unverified supporters in ${families.size} families: ${[...families].join(", ")}`);
  if (people.length === 0) return db.$disconnect();
  if (!process.env.RESEND_API_KEY) console.log("RESEND_API_KEY isn't set, so emails will only be printed.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Email each of them a verification link to ${PRODUCTION_URL}? (yes/no) `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Nothing sent.");
    return db.$disconnect();
  }
  await sendVerifications(db, sendEmails, people, PRODUCTION_URL);
  console.log(`Sent ${people.length} verification emails.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
