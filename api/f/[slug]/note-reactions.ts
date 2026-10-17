import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { setNoteReactions } from "../../../server/reactions.js";

// PUT { reactions }: a family member sets the emoji anyone may react with on the family's notes.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json(await setNoteReactions(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
