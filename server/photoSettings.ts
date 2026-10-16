import { parseCloudinaryUrl, type CloudinaryConfig } from "./cloudinary.js";

// Which photos the server accepts. Handlers read it from the environment once; everything
// else takes it as an argument, so tests never depend on the machine's settings.
export type PhotoSettings = {
  placeholders: boolean;
  cloudinary?: CloudinaryConfig | null;
  // Replaces the Cloudinary delete. Tests pass a recorder so nothing is fetched.
  destroy?: (publicIds: string[]) => Promise<void>;
};

export const NO_PHOTOS: PhotoSettings = { placeholders: false, cloudinary: null };

// Placeholder photos are for test sites only: production refuses them even if the
// setting is there by mistake. A Cloudinary URL turns on real photos everywhere, including
// production, and real uploads win over placeholders.
export function photoSettingsFromEnv(env: Record<string, string | undefined> = process.env): PhotoSettings {
  return {
    placeholders: env.PHOTO_PLACEHOLDERS === "1" && env.VERCEL_ENV !== "production",
    cloudinary: parseCloudinaryUrl(env.CLOUDINARY_URL),
  };
}

// What the editor offers, as reported by /me. Real uploads win when Cloudinary is configured.
export function photoMode(settings: PhotoSettings): "real" | "placeholder" | "off" {
  if (settings.cloudinary) return "real";
  return settings.placeholders ? "placeholder" : "off";
}
