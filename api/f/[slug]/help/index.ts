import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { createHelp, helpMessage, listHelp } from "../../../../server/help.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../../server/http.js";

// GET: the family's message, or null, and its requests, oldest first; the page orders them by date.
// POST { body, slots, requireName, requireEmail, requirePhone, date, time }: a family member adds one.
// slots is a number, or null for "many." date is "YYYY-MM-DD" and time "HH:MM", or null.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    if (req.method === "GET") {
      const [message, requests] = await Promise.all([helpMessage(getDb(), ctx.person), listHelp(getDb(), ctx.person)]);
      return res.status(200).json({ message, requests });
    }
    const body = jsonBody(req, res);
    if (!body) return;
    res.status(200).json({ request: await createHelp(getDb(), ctx.person, body) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
