import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { familyContext, methodNotAllowed, param, sendRequestError, unauthorized } from "../../../../server/http.js";
import { deleteNote } from "../../../../server/notes.js";

// DELETE: a note's author, or any family member, deletes it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    await deleteNote(getDb(), ctx.person, param(req, "id"));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
