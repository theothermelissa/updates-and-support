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
import { setRemoved } from "../../../../server/people.js";

// A family member removing ({ removed: true }) or restoring ({ removed: false }) a supporter.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json({ supporter: await setRemoved(getDb(), ctx.person, param(req, "id"), body.removed) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
