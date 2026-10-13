import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../server/db.js";
import { familyContext, methodNotAllowed, param } from "../../../server/http.js";
import { unsubscribe } from "../../../server/notifications.js";

// Mail apps' one-click unsubscribe (RFC 8058) and the unsubscribe page both POST here with
// the token in the address. The body is never read: mail apps send it as a form or
// multipart, and everything needed is in the address.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  await unsubscribe(getDb(), ctx.family.slug, param(req, "token"));
  res.status(200).json({ ok: true });
}
