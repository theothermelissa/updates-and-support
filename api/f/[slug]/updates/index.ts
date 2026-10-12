import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { createUpdate, listUpdates } from "../../../../server/updates.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);

  if (req.method === "GET") {
    return res.status(200).json({ updates: await listUpdates(getDb(), ctx.person) });
  }
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(201).json({ update: await createUpdate(getDb(), ctx.person, body.body) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
