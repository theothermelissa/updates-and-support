// Which photos the server accepts. Handlers read it from the environment once; everything
// else takes it as an argument, so tests never depend on the machine's settings.
export type PhotoSettings = { placeholders: boolean };

export const NO_PHOTOS: PhotoSettings = { placeholders: false };

// Placeholder photos are for test sites only: production refuses them even if the
// setting is there by mistake.
export function photoSettingsFromEnv(env: Record<string, string | undefined> = process.env): PhotoSettings {
  return { placeholders: env.PHOTO_PLACEHOLDERS === "1" && env.VERCEL_ENV !== "production" };
}

// What the editor offers, as reported by /me.
export function photoMode(settings: PhotoSettings): "placeholder" | "off" {
  return settings.placeholders ? "placeholder" : "off";
}
