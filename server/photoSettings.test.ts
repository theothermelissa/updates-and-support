import { expect, it } from "vitest";
import { photoMode, photoSettingsFromEnv } from "./photoSettings.js";

it("turns placeholders on only for exactly 1", () => {
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1" })).toEqual({ placeholders: true });
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1", VERCEL_ENV: "preview" })).toEqual({ placeholders: true });
  for (const value of [undefined, "", "0", "true", "yes", " 1"]) {
    expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: value })).toEqual({ placeholders: false });
  }
});

it("never turns placeholders on in production", () => {
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1", VERCEL_ENV: "production" })).toEqual({ placeholders: false });
});

it("reports what the editor offers", () => {
  expect(photoMode({ placeholders: true })).toBe("placeholder");
  expect(photoMode({ placeholders: false })).toBe("off");
});
