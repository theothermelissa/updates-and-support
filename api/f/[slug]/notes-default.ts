import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { setAllowNotesByDefault } from "../../../server/notes.js";

// PUT { allowNotesByDefault }: a family member sets whether new updates start out allowing notes.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json(await setAllowNotesByDefault(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
