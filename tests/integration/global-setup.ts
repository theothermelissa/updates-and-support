import "dotenv/config";
import { execSync } from "node:child_process";

// Bring the test database's schema up to date before any integration test runs.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set; see .env.example");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
