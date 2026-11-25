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
import { setAdmin, setRemoved, verifySupporter } from "../../../../server/people.js";

// An admin removing ({ removed: true }) a supporter or family member, restoring
// ({ removed: false }) a supporter, verifying a supporter's email ({ verified: true }), or
// making a family member an admin or not ({ admin: true | false }).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  if (["removed", "verified", "admin"].filter((key) => key in body).length > 1) {
    return res.status(400).json({ error: "Send one of removed, verified, or admin" });
  }
  try {
    if ("admin" in body) await setAdmin(getDb(), ctx.person, param(req, "id"), body.admin);
    else if ("verified" in body) await verifySupporter(getDb(), ctx.person, param(req, "id"), body.verified);
    else await setRemoved(getDb(), ctx.person, param(req, "id"), body.removed);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
