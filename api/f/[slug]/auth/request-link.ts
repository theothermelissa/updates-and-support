import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requestSignInLink } from "../../../../server/auth.js";
import { getDb } from "../../../../server/db.js";
import { sendEmail } from "../../../../server/email.js";
import { familyContext, jsonBody, methodNotAllowed } from "../../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (typeof body.email === "string") {
    await requestSignInLink(getDb(), sendEmail, ctx.family.slug, body.email);
  }
  // The same reply whether or not the email is known.
  res.status(200).json({ ok: true });
}
