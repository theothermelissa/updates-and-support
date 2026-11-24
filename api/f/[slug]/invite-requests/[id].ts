import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import { sendEmail } from "../../../../server/email.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  param,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { approveInviteRequest, declineInviteRequest } from "../../../../server/inviteRequests.js";

// A family member approving (POST) or declining (DELETE) a request to join.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") return methodNotAllowed(res);
  if (req.method === "POST" && !jsonBody(req, res)) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    if (req.method === "POST") {
      res.status(200).json(await approveInviteRequest(getDb(), sendEmail, ctx.person, param(req, "id")));
    } else {
      await declineInviteRequest(getDb(), ctx.person, param(req, "id"));
      res.status(200).json({ ok: true });
    }
  } catch (err) {
    sendRequestError(res, err);
  }
}
