import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../../server/db.js";
import { resolveHelp } from "../../../../../server/help.js";
import { familyContext, jsonBody, methodNotAllowed, param, sendRequestError, unauthorized } from "../../../../../server/http.js";

// POST { resolved }: a family member marks a request resolved, or reopens it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json({ request: await resolveHelp(getDb(), ctx.person, param(req, "id"), body) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
