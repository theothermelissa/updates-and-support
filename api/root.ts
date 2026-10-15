import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rootFamilySlug } from "../server/families.js";
import { methodNotAllowed } from "../server/http.js";

// GET: the address of the family the site's root shows, if the deployment names one.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  res.setHeader("Cache-Control", "no-store");
  const slug = rootFamilySlug();
  if (!slug) return res.status(404).json({ error: "Not found" });
  res.status(200).json({ slug });
}
