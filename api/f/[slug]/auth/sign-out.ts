import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signOut } from "../../../../server/auth.js";
import { clearSessionCookie, readSessionCookie } from "../../../../server/cookies.js";
import { getDb } from "../../../../server/db.js";
import { methodNotAllowed, param } from "../../../../server/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const slug = param(req, "slug");
  const token = readSessionCookie(req, slug);
  if (token) await signOut(getDb(), token);
  clearSessionCookie(res, slug);
  res.status(200).json({ ok: true });
}
