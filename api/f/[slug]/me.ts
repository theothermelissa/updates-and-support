import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { hasHelpRequests } from "../../../server/help.js";
import { familyContext, methodNotAllowed, personView, unauthorized } from "../../../server/http.js";
import { photoMode, photoSettingsFromEnv } from "../../../server/photoSettings.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  res.status(200).json({
    family: {
      displayName: ctx.family.displayName,
      photos: photoMode(photoSettingsFromEnv()),
      hasHelpRequests: await hasHelpRequests(getDb(), ctx.family.id),
    },
    person: personView(ctx.person),
  });
}
