import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { familyContext, methodNotAllowed, sendRequestError, unauthorized } from "../../../../server/http.js";
import { listPeople } from "../../../../server/people.js";

// The People page's data: supporters and the community question, for family members only.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json(await listPeople(getDb(), ctx.person));
  } catch (err) {
    sendRequestError(res, err);
  }
}
