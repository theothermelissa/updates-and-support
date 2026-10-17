import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { setHelpMessage } from "../../../server/help.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";

// PUT { content, dos, donts }: a family member writes or changes the message at the top of How
// to help. Each part is a document, null to remove it, or left out to keep it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json(await setHelpMessage(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
