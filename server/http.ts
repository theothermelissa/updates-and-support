import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession } from "./auth.js";
import { readSessionCookie } from "./cookies.js";
import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { findFamilyBySlug } from "./families.js";
import type { Family, Person } from "./generated/prisma/client.js";

// Shared request plumbing for the handlers in api/f/[slug]/.

export function param(req: VercelRequest, name: string): string {
  const value = req.query[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// The family named in the URL and whoever is signed in to it, or null after
// replying 404 for an unknown family.
export async function familyContext(
  db: Db,
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ family: Family; person: Person | null } | null> {
  // Family responses are private; no browser or CDN may keep a copy.
  res.setHeader("Cache-Control", "no-store");
  const slug = param(req, "slug");
  const family = await findFamilyBySlug(db, slug);
  if (!family) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  const token = readSessionCookie(req, slug);
  const person = token ? await getSession(db, slug, token) : null;
  return { family, person };
}

// Request bodies must be JSON, which cross-site HTML forms cannot send.
export function jsonBody(req: VercelRequest, res: VercelResponse): Record<string, unknown> | null {
  const isJson = req.headers["content-type"]?.startsWith("application/json");
  if (!isJson || typeof req.body !== "object" || req.body === null) {
    res.status(400).json({ error: "Expected a JSON body" });
    return null;
  }
  return req.body as Record<string, unknown>;
}

export function methodNotAllowed(res: VercelResponse) {
  res.status(405).json({ error: "Method not allowed" });
}

export function unauthorized(res: VercelResponse) {
  res.status(401).json({ error: "Not signed in" });
}

// What the client may know about a person.
export function personView(person: Person) {
  return { id: person.id, name: person.name, role: person.role };
}

// Replies with the status of a RequestError; anything else is a real failure and rethrows.
export function sendRequestError(res: VercelResponse, err: unknown) {
  if (err instanceof RequestError) return res.status(err.status).json({ error: err.message });
  throw err;
}
