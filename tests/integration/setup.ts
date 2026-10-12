import "dotenv/config";

// Integration tests run against TEST_DATABASE_URL, never the app's DATABASE_URL,
// because tests are free to wipe and reseed their database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set; see .env.example");
}
