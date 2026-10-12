import type { VercelRequest, VercelResponse } from "@vercel/node";

// One cookie per family, so a browser can be signed in to several at once.
function cookieName(slug: string) {
  return `session_${slug}`;
}

export function readSessionCookie(req: VercelRequest, slug: string): string | undefined {
  return req.cookies[cookieName(slug)];
}

export function setSessionCookie(res: VercelResponse, slug: string, token: string, lifetimeMs: number) {
  res.setHeader("Set-Cookie", sessionCookie(slug, token, Math.floor(lifetimeMs / 1000)));
}

export function clearSessionCookie(res: VercelResponse, slug: string) {
  res.setHeader("Set-Cookie", sessionCookie(slug, "", 0));
}

function sessionCookie(slug: string, value: string, maxAgeSeconds: number) {
  // `vercel dev` serves plain http, where some browsers drop Secure cookies.
  const secure = process.env.VERCEL_ENV === "development" ? "" : "; Secure";
  return `${cookieName(slug)}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
