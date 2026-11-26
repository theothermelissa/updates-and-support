import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, jsonBody, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { photoSettingsFromEnv } from "../../../server/photoSettings.js";
import { listPublicUpdates, setPublicNotice, setPublicUpdates } from "../../../server/publicUpdates.js";

// GET: the family's public updates, for anyone, signed in or not. The signed-out page is the only
// caller. PUT { on } or { publicNotice }: an admin turns public updates on or off, or rewords their banner.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "PUT") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (req.method === "GET") {
    return res.status(200).json(await listPublicUpdates(getDb(), ctx.family, photoSettingsFromEnv()));
  }
  if (!ctx.person) return unauthorized(res);
  const body = jsonBody(req, res);
  if (!body) return;
  try {
    const result = "on" in body ? await setPublicUpdates(getDb(), ctx.person, body) : await setPublicNotice(getDb(), ctx.person, body);
    res.status(200).json(result);
  } catch (err) {
    sendRequestError(res, err);
  }
}
