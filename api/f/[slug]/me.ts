import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, methodNotAllowed, personView, unauthorized } from "../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  res.status(200).json({ family: { displayName: ctx.family.displayName }, person: personView(ctx.person) });
}
