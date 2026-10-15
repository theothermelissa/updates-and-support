import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  param,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { setRemoved, verifySupporter } from "../../../../server/people.js";

// A family member removing ({ removed: true }) a supporter or family member, restoring
// ({ removed: false }) a supporter, or verifying a supporter's email ({ verified: true }).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  if ("removed" in body && "verified" in body) {
    return res.status(400).json({ error: "Send either removed or verified, not both" });
  }
  try {
    if ("verified" in body) await verifySupporter(getDb(), ctx.person, param(req, "id"), body.verified);
    else await setRemoved(getDb(), ctx.person, param(req, "id"), body.removed);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
