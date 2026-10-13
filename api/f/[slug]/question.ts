import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  sendRequestError,
  unauthorized,
} from "../../../server/http.js";
import { changeQuestion } from "../../../server/people.js";

// A family member changing the community question and its accepted answers.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json(await changeQuestion(getDb(), ctx.person, body));
  } catch (err) {
    sendRequestError(res, err);
  }
}
