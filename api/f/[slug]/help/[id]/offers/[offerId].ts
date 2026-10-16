import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../../../server/db.js";
import { removeOffer } from "../../../../../../server/help.js";
import { familyContext, methodNotAllowed, param, sendRequestError, unauthorized } from "../../../../../../server/http.js";

// DELETE: a family member removes one offer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    await removeOffer(getDb(), ctx.person, param(req, "id"), param(req, "offerId"));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
