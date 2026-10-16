import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { deleteHelp, updateHelp } from "../../../../server/help.js";
import { familyContext, jsonBody, methodNotAllowed, param, sendRequestError, unauthorized } from "../../../../server/http.js";

// PATCH { body, slots, requireName, requireEmail, requirePhone, date, time }: a family member rewrites a
// request. Every field is required. Offers stay.
// DELETE: a family member removes it, and every offer on it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "DELETE") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    const id = param(req, "id");
    if (req.method === "DELETE") {
      await deleteHelp(getDb(), ctx.person, id);
      return res.status(200).json({ ok: true });
    }
    const body = jsonBody(req, res);
    if (!body) return;
    res.status(200).json({ request: await updateHelp(getDb(), ctx.person, id, body) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
