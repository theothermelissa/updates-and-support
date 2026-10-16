import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, methodNotAllowed, sendRequestError, unauthorized } from "../../../server/http.js";
import { photoSettingsFromEnv } from "../../../server/photoSettings.js";
import { issuePhotoUpload } from "../../../server/photos.js";

// POST: a family member gets a signature for uploading one photo straight to Cloudinary.
// The fields are fixed; the browser sends the file itself and reads back only the public id.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  try {
    res.status(200).json(issuePhotoUpload(ctx.person, photoSettingsFromEnv()));
  } catch (err) {
    sendRequestError(res, err);
  }
}
