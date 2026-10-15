import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { setReaction } from "../../../server/reactions.js";

// POST { updateId, kind, on }: anyone signed in to the family turns one of their reactions on or off.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    await setReaction(getDb(), ctx.person, body);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
