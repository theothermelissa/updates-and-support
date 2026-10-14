import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { sendEmail } from "../../../server/email.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { addSupporter } from "../../../server/people.js";

// POST: a family member adds a supporter.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json(await addSupporter(getDb(), sendEmail, ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
