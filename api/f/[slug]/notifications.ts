import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  personView,
  sendRequestError,
  unauthorized,
} from "../../../server/http.js";
import { setNotifications } from "../../../server/notifications.js";

// A signed-in supporter turning their own notification emails on or off.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json({ person: personView(await setNotifications(getDb(), ctx.person, body.on)) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
