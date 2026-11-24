import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { sendEmail, sendEmails } from "../../../../server/email.js";
import {
  clientOf,
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
} from "../../../../server/http.js";
import { requestInvite } from "../../../../server/inviteRequests.js";

// POST: a visitor asks an invite-only family to add them. No sign-in; the reply is "thanks"
// whoever the email belongs to, or "closed" when the family is at its pending cap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  try {
    const result = await requestInvite(getDb(), sendEmail, sendEmails, ctx.family, clientOf(req, res), body);
    res.status(200).json({ result });
  } catch (err) {
    sendRequestError(res, err);
  }
}
