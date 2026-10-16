import { expect, it } from "vitest";
import { photoMode, photoSettingsFromEnv } from "./photoSettings.js";

const off = { placeholders: false, cloudinary: null };
const grey = { placeholders: true, cloudinary: null };
const real = { cloudName: "demo", apiKey: "1234", apiSecret: "abcd" };

it("turns placeholders on only for exactly 1", () => {
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1" })).toEqual(grey);
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1", VERCEL_ENV: "preview" })).toEqual(grey);
  for (const value of [undefined, "", "0", "true", "yes", " 1"]) {
    expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: value })).toEqual(off);
  }
});

it("never turns placeholders on in production", () => {
  expect(photoSettingsFromEnv({ PHOTO_PLACEHOLDERS: "1", VERCEL_ENV: "production" })).toEqual(off);
});

it("reads Cloudinary from its URL, and real uploads win over placeholders", () => {
  const url = "cloudinary://1234:abcd@demo";
  expect(photoSettingsFromEnv({ CLOUDINARY_URL: url })).toEqual({ placeholders: false, cloudinary: real });
  expect(photoSettingsFromEnv({ CLOUDINARY_URL: url, PHOTO_PLACEHOLDERS: "1" })).toEqual({ placeholders: true, cloudinary: real });
  expect(photoSettingsFromEnv({ CLOUDINARY_URL: url, PHOTO_PLACEHOLDERS: "1", VERCEL_ENV: "production" })).toEqual({
    placeholders: false,
    cloudinary: real,
  });
  expect(photoMode({ placeholders: true, cloudinary: real })).toBe("real");
  expect(photoMode({ placeholders: false, cloudinary: real })).toBe("real");
  expect(photoMode(grey)).toBe("placeholder");
  expect(photoMode(off)).toBe("off");
});
