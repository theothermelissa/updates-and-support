import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_LIFETIME } from "../../../server/auth.js";
import { setSessionCookie } from "../../../server/cookies.js";
import { getDb } from "../../../server/db.js";
import { sendEmail } from "../../../server/email.js";
import { answerGate, gateInfo } from "../../../server/gate.js";
import {
  clientOf,
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
} from "../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (req.method === "GET") return res.status(200).json(gateInfo(ctx.family));

  const body = jsonBody(req, res);
  if (!body) return;
  try {
    const outcome = await answerGate(getDb(), sendEmail, ctx.family, clientOf(req, res), body);
    if (outcome.result === "joined") {
      setSessionCookie(res, ctx.family.slug, outcome.sessionToken, SESSION_LIFETIME.supporter);
      return res.status(200).json({ result: "joined" });
    }
    res.status(200).json({ result: outcome.result });
  } catch (err) {
    sendRequestError(res, err);
  }
}
