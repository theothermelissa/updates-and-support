import { randomBytes } from "node:crypto";

// The SDK reads CLOUDINARY_URL as it loads and throws if the value is malformed. Loaded here
// rather than imported, so a bad value breaks only video notes, never the feed around them.
type Sdk = typeof import("cloudinary").v2;
let loaded: Sdk | null = null;
let loadError: unknown = null;
try {
  loaded = (await import("cloudinary")).v2;
} catch (err) {
  loadError = err;
  console.error("Cloudinary couldn't load; check CLOUDINARY_URL.", err);
}

function sdk(): Sdk {
  if (!loaded) throw new Error(`Cloudinary isn't available: ${(loadError as Error)?.message}`);
  return loaded;
}

// Everything the app asks of its video host. Server functions take a store, so tests pass a
// fake and never reach Cloudinary.
export interface VideoStore {
  // Signed fields for the browser's direct upload of one video, to `url`.
  uploadParams(publicId: string): { url: string; fields: Record<string, string> };
  // An uploaded video's length, or null unless it exists as an authenticated video.
  describe(publicId: string): Promise<{ duration: number } | null>;
  // Deletes videos and their conversions, including cached copies. Already gone counts as done.
  destroy(publicIds: string[]): Promise<void>;
  // Signed links to a video's converted mp4 and its still. Never the original upload, which
  // can carry a phone's location.
  urls(publicId: string): { src: string; poster: string };
}

// The conversions every browser plays. Uploads ask for them eagerly, and links name exactly
// the same strings, so playing a video uses the conversion rather than starting a new one.
const VIDEO = "c_limit,h_1280,w_1280,q_auto,vc_h264";
const POSTER = "c_limit,h_960,w_960,so_0";
const EAGER = `${VIDEO}/mp4|${POSTER}/jpg`;

// Every asset call names the video and authenticated types explicitly. Cloudinary's defaults
// are image and public, which would look in the wrong place or publish the video.
const KIND = { resource_type: "video", type: "authenticated" } as const;

// A new, unguessable public ID under this deployment's folder. The Cloudinary environment is
// shared with other projects, so the folder keeps this app's videos, and each deployment's, apart.
export function newPublicId(): string {
  const folder = process.env.CLOUDINARY_FOLDER || "updates-and-support/dev";
  return `${folder}/${randomBytes(16).toString("base64url")}`;
}

// Reads CLOUDINARY_URL (cloudinary://key:secret@cloud), which the SDK picks up itself.
function config() {
  const { cloud_name, api_key, api_secret } = sdk().config();
  if (!cloud_name || !api_key || !api_secret) throw new Error("CLOUDINARY_URL is not set");
  return { cloud_name, api_key, api_secret };
}

export const cloudinaryStore: VideoStore = {
  uploadParams(publicId) {
    const { cloud_name, api_key, api_secret } = config();
    // Every field here is signed, so the browser can't change them. Cloudinary doesn't sign the
    // resource type, which is in the URL; a non-video upload is harmless because every other
    // call asks only for authenticated videos.
    const signed = {
      public_id: publicId,
      type: "authenticated",
      overwrite: "false",
      eager: EAGER,
      eager_async: "true",
      timestamp: String(Math.round(Date.now() / 1000)),
    };
    const signature = sdk().utils.api_sign_request(signed, api_secret);
    return {
      url: `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
      fields: { ...signed, signature, api_key },
    };
  },

  async describe(publicId) {
    config();
    try {
      // The length comes only with media_metadata.
      const resource = await sdk().api.resource(publicId, { ...KIND, media_metadata: true });
      return typeof resource.duration === "number" ? { duration: resource.duration } : null;
    } catch (err) {
      if (httpCode(err) === 404) return null;
      throw err;
    }
  },

  async destroy(publicIds) {
    config();
    for (let i = 0; i < publicIds.length; i += 100) {
      // Cloudinary's limit per request. Missing videos come back "not_found" without an error.
      await sdk().api.delete_resources(publicIds.slice(i, i + 100), { ...KIND, invalidate: true });
    }
  },

  urls(publicId) {
    config();
    // urlAnalytics: false leaves off the SDK's usage parameter, which reports to Cloudinary
    // which SDK made the link.
    const link = (raw_transformation: string, format: string) =>
      sdk().url(publicId, { ...KIND, sign_url: true, secure: true, urlAnalytics: false, raw_transformation, format });
    return { src: link(VIDEO, "mp4"), poster: link(POSTER, "jpg") };
  },
};

// The SDK rejects with { error: { http_code } } rather than an Error.
function httpCode(err: unknown): number | undefined {
  return (err as { error?: { http_code?: number } })?.error?.http_code;
}
