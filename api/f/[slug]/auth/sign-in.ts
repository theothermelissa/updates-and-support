import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_LIFETIME, signInWithLink } from "../../../../server/auth.js";
import { setSessionCookie } from "../../../../server/cookies.js";
import { getDb } from "../../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, personView } from "../../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  const result =
    typeof body.token === "string" ? await signInWithLink(getDb(), ctx.family.slug, body.token) : null;
  if (!result) {
    return res.status(400).json({ error: "This link has expired or was already used." });
  }
  setSessionCookie(res, ctx.family.slug, result.sessionToken, SESSION_LIFETIME[result.person.role]);
  res.status(200).json({ person: personView(result.person) });
}
