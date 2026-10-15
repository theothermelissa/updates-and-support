import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { sendEmail } from "../../../server/email.js";
import { addEmail } from "../../../server/gate.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";

// POST { name, email }: a signed-in supporter without an email gives one, to get notifications.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json(await addEmail(getDb(), sendEmail, ctx.family, ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
