import type { VercelRequest, VercelResponse } from "@vercel/node";
import { newToken } from "./tokens.js";

const YEAR_SECONDS = 365 * 24 * 60 * 60;
const BROWSER_COOKIE = "gate_browser";

// One session cookie per family, so a browser can be signed in to several at once.
function sessionCookieName(slug: string) {
  return `session_${slug}`;
}

export function readSessionCookie(req: VercelRequest, slug: string): string | undefined {
  return req.cookies[sessionCookieName(slug)];
}

export function setSessionCookie(res: VercelResponse, slug: string, token: string, lifetimeMs: number) {
  appendCookie(res, sessionCookieName(slug), token, Math.floor(lifetimeMs / 1000));
}

export function clearSessionCookie(res: VercelResponse, slug: string) {
  appendCookie(res, sessionCookieName(slug), "", 0);
}

// A random ID for the gate's per-browser limit, set the first time it's needed.
export function browserId(req: VercelRequest, res: VercelResponse): string {
  const existing = req.cookies[BROWSER_COOKIE];
  if (existing) return existing;
  const id = newToken();
  appendCookie(res, BROWSER_COOKIE, id, YEAR_SECONDS);
  return id;
}

// Appends rather than sets, so a response can carry more than one cookie.
function appendCookie(res: VercelResponse, name: string, value: string, maxAgeSeconds: number) {
  // `vercel dev` serves plain http, where some browsers drop Secure cookies.
  const secure = process.env.VERCEL_ENV === "development" ? "" : "; Secure";
  res.appendHeader(
    "Set-Cookie",
    `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}
