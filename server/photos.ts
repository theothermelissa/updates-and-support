import { randomBytes } from "node:crypto";
import { INCOMING_TRANSFORMATION, signParams, type CloudinaryConfig } from "./cloudinary.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";
import { requireFamilyMember } from "./people.js";
import type { PhotoSettings } from "./photoSettings.js";

const FORMATS = "jpg,png,webp,gif,heic,heif";

export function newPhotoPublicId(familyId: string): string {
  return `families/${familyId}/${randomBytes(16).toString("base64url")}`;
}

// Signed fields for one direct upload. `now` is milliseconds, so tests can pin the timestamp.
export function uploadFields(config: CloudinaryConfig, publicId: string, now = Date.now()) {
  const params: Record<string, string> = {
    allowed_formats: FORMATS,
    overwrite: "false",
    public_id: publicId,
    timestamp: String(Math.round(now / 1000)),
    transformation: INCOMING_TRANSFORMATION,
    type: "authenticated",
  };
  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    fields: { ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) },
  };
}

// Family members only, and only while Cloudinary is configured. The id is chosen here.
export function issuePhotoUpload(person: Person, settings: PhotoSettings) {
  requireFamilyMember(person);
  if (!settings.cloudinary) throw new RequestError(404, "Not found");
  const publicId = newPhotoPublicId(person.familyId);
  return { publicId, ...uploadFields(settings.cloudinary, publicId) };
}
