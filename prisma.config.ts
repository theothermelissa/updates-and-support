import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need Neon's direct connection, not the pooled one the app uses at runtime.
    // Optional so `prisma generate` works without a database (e.g. in CI's build step).
    url: process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"] ?? "",
  },
});
