import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../server/db.js";
import { checkHealth } from "../server/health.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const health = await checkHealth(getDb());
  res.status(health.ok ? 200 : 503).json(health);
}
