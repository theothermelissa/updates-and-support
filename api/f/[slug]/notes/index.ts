import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../../server/http.js";
import { createNote, listNotes } from "../../../../server/notes.js";

// GET: every note in the family, newest first, for the wall.
// POST { updateId, body, color, name? }: anyone signed in to the family leaves a note on an update.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    if (req.method === "GET") return res.status(200).json({ notes: await listNotes(getDb(), ctx.person) });
    const body = jsonBody(req, res);
    if (!body) return;
    res.status(200).json(await createNote(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
