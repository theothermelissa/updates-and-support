import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { familyContext, methodNotAllowed, sendRequestError, unauthorized } from "../../../../server/http.js";
import { issueVideoUpload } from "../../../../server/notes.js";

// POST: anyone signed in to the family gets a ticket to upload one video for a note, with
// the signed fields for uploading it straight to the video host.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json(await issueVideoUpload(getDb(), ctx.person));
  } catch (err) {
    sendRequestError(res, err);
  }
}
