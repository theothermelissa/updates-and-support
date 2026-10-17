import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { setPrivacyNotice } from "../../../server/people.js";

// PUT { privacyNotice }: a family member rewords the privacy banner, or empties it for the standard wording.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    res.status(200).json(await setPrivacyNotice(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
