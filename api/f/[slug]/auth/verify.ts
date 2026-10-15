import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_LIFETIME, verifyEmail } from "../../../../server/auth.js";
import { getDb } from "../../../../server/db.js";
import { signInWithVerifyLink } from "../../../../server/gate.js";
import { clientOf, familyContext, jsonBody, methodNotAllowed, startSession } from "../../../../server/http.js";

// { token }: marks an email verified, and says whether the link can still sign in.
// { token, answer }: signs a supporter in with the link and the community question's answer.
// The link alone never signs anyone in.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  const token = typeof body.token === "string" ? body.token : "";
  const expired = () => res.status(400).json({ error: "This link has expired or was already used." });

  if (body.answer === undefined) {
    const verified = token ? await verifyEmail(getDb(), ctx.family.slug, token) : null;
    if (!verified) return expired();
    return res.status(200).json({ ok: true, canSignIn: verified.canSignIn });
  }

  const answer = typeof body.answer === "string" ? body.answer : "";
  const outcome = await signInWithVerifyLink(getDb(), ctx.family, clientOf(req, res), token, answer);
  if (outcome.result === "invalid") return expired();
  if (outcome.result === "signed-in") {
    await startSession(getDb(), req, res, ctx.family.slug, outcome.sessionToken, SESSION_LIFETIME.supporter);
    return res.status(200).json({ result: "signed-in" });
  }
  res.status(200).json({ result: outcome.result });
}
