import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  param,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { photoSettingsFromEnv } from "../../../../server/photoSettings.js";
import { deleteUpdate, editUpdate } from "../../../../server/updates.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "DELETE") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const id = param(req, "id");

  try {
    if (req.method === "DELETE") {
      await deleteUpdate(getDb(), ctx.person, id);
      return res.status(200).json({ ok: true });
    }
    const body = jsonBody(req, res);
    if (!body) return;
    res.status(200).json({ update: await editUpdate(getDb(), ctx.person, id, body, photoSettingsFromEnv()) });
  } catch (err) {
    sendRequestError(res, err);
  }
}
