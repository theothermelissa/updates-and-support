import { createHash } from "node:crypto";
import { stringify } from "node:querystring";

// Hand-written Cloudinary signing. The SDK reads CLOUDINARY_URL from global state, so tests
// couldn't keep it from the network. Checked against Cloudinary's documented examples.

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

// Applied to the stored file: shrink to 1600px wide and strip embedded details, including GPS.
export const INCOMING_TRANSFORMATION = "c_limit,w_1600,fl_force_strip";
// What every feed link asks Cloudinary to deliver. Never the original upload.
export const DELIVERY_TRANSFORMATION = "c_limit,w_1600/f_auto/q_auto";

const DESTROY_TIMEOUT_MS = 5_000;

// cloudinary://key:secret@cloud. Empty means photos are off. A set but unusable value throws,
// and the message never includes the value.
export function parseCloudinaryUrl(value: string | undefined): CloudinaryConfig | null {
  if (!value) return null;
  const bad = new Error("CLOUDINARY_URL must look like cloudinary://key:secret@cloud");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw bad;
  }
  const apiKey = decodeURIComponent(url.username);
  const apiSecret = decodeURIComponent(url.password);
  const cloudName = url.hostname;
  if (url.protocol !== "cloudinary:" || !apiKey || !apiSecret || !cloudName || (url.pathname !== "" && url.pathname !== "/")) {
    throw bad;
  }
  return { apiKey, apiSecret, cloudName };
}

// SHA-1 hex of the upload parameters, sorted and joined, with the secret appended.
export function signParams(params: Record<string, string>, apiSecret: string): string {
  const serialized = Object.keys(params)
    .filter((key) => params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(serialized + apiSecret).digest("hex");
}

// First 8 characters of the URL-safe base64 SHA-1 of a delivery path plus the secret.
export function signPath(path: string, apiSecret: string): string {
  const digest = createHash("sha1").update(path + apiSecret).digest("base64");
  return digest.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "").slice(0, 8);
}

// A signed link to the shrunk photo. The transformation is fixed, so a link can't be altered
// to ask for the original or a different size.
export function photoUrl(config: CloudinaryConfig, publicId: string): string {
  const path = `${DELIVERY_TRANSFORMATION}/${publicId}`;
  return `https://res.cloudinary.com/${config.cloudName}/image/authenticated/s--${signPath(path, config.apiSecret)}--/${path}`;
}

// families/<familyId>/<22 url-safe characters>, anchored, so one family's id can't name another's.
export function isFamilyPhotoId(familyId: string, publicId: string): boolean {
  if (!familyId) return false;
  const escaped = familyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^families/${escaped}/[A-Za-z0-9_-]{22}$`).test(publicId);
}

// Deletes stored photos and their cached copies. One request each, in parallel. Already gone
// is still an error only when Cloudinary rejects the call; a missing photo comes back as success.
export async function destroyPhotos(config: CloudinaryConfig, publicIds: string[]): Promise<void> {
  const results = await Promise.allSettled(publicIds.map((publicId) => destroyOne(config, publicId)));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) throw new Error(`Couldn't delete ${failed} of ${publicIds.length} photos`);
}

async function destroyOne(config: CloudinaryConfig, publicId: string): Promise<void> {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/authenticated`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stringify({ "public_ids[]": publicId, invalidate: "true" }),
    signal: AbortSignal.timeout(DESTROY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cloudinary responded ${res.status}`);
}
