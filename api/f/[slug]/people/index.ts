import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { sendEmail } from "../../../../server/email.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { addFamilyMember, listPeople } from "../../../../server/people.js";

// GET: the People page's data, for family members only. POST: add a family member.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    if (req.method === "GET") return res.status(200).json(await listPeople(getDb(), ctx.person));
    const body = jsonBody(req, res);
    if (!body) return;
    res.status(200).json(await addFamilyMember(getDb(), sendEmail, ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
