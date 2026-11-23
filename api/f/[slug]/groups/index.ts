import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { createGroup } from "../../../../server/groups.js";

// A family member creating a group ({ name }). The People page lists groups (GET /people).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json({ group: await createGroup(getDb(), ctx.person, body) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
