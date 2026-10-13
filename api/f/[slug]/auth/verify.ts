import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyEmail } from "../../../../server/auth.js";
import { getDb } from "../../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed } from "../../../../server/http.js";

// Marks an email verified. Sets no cookie: a verification link never signs anyone in.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  const verified = typeof body.token === "string" && (await verifyEmail(getDb(), ctx.family.slug, body.token));
  if (!verified) return res.status(400).json({ error: "This link has expired or was already used." });
  res.status(200).json({ ok: true });
}
