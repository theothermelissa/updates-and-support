import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_LIFETIME } from "../../../server/auth.js";
import { getDb } from "../../../server/db.js";
import { answerGate, gateInfo } from "../../../server/gate.js";
import { clientOf, familyContext, jsonBody, methodNotAllowed, startSession } from "../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (req.method === "GET") return res.status(200).json(gateInfo(ctx.family));

  const body = jsonBody(req, res);
  if (!body) return;
  // Already signed in here, as from a gate left open in another tab: keep that session.
  if (ctx.person) return res.status(200).json({ result: "joined" });
  const outcome = await answerGate(getDb(), ctx.family, clientOf(req, res), body);
  if (outcome.result === "joined") {
    await startSession(getDb(), req, res, ctx.family.slug, outcome.sessionToken, SESSION_LIFETIME.supporter);
  }
  res.status(200).json({ result: outcome.result });
}
