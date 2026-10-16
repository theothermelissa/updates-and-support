import { afterEach, expect, it, vi } from "vitest";
import {
  DELIVERY_TRANSFORMATION,
  destroyPhotos,
  isFamilyPhotoId,
  parseCloudinaryUrl,
  photoUrl,
  signParams,
  signPath,
  type CloudinaryConfig,
} from "./cloudinary.js";
import { newPhotoPublicId, uploadFields } from "./photos.js";

const config: CloudinaryConfig = { cloudName: "demo", apiKey: "1234", apiSecret: "abcd" };

afterEach(() => {
  vi.unstubAllGlobals();
});

it("matches Cloudinary's documented upload signature", () => {
  expect(
    signParams(
      {
        timestamp: "1315060510",
        public_id: "sample_image",
        eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      },
      "abcd",
    ),
  ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
});

it("matches Cloudinary's documented delivery signature", () => {
  expect(signPath("c_fill,w_300,h_250/e_grayscale/sample-authenticated.png", "abcd")).toBe("iDy_JeBq");
});

it("parses a cloudinary URL and refuses a bad one without echoing it", () => {
  expect(parseCloudinaryUrl(undefined)).toBeNull();
  expect(parseCloudinaryUrl("")).toBeNull();
  expect(parseCloudinaryUrl("cloudinary://1234:abcd@demo")).toEqual(config);
  expect(parseCloudinaryUrl("cloudinary://1234:a%2Fb@demo")).toEqual({ ...config, apiSecret: "a/b" });
  try {
    parseCloudinaryUrl("not-a-url-SECRETVALUE");
    expect.unreachable();
  } catch (err) {
    expect((err as Error).message).toMatch(/cloudinary:\/\//);
    expect((err as Error).message).not.toContain("SECRETVALUE");
  }
  expect(() => parseCloudinaryUrl("https://1234:abcd@demo")).toThrow(/cloudinary:\/\//);
  expect(() => parseCloudinaryUrl("cloudinary://demo")).toThrow(/cloudinary:\/\//);
});

it("signs an upload over exactly the fixed fields, with a new family id each time", () => {
  const familyId = "cmrivera";
  const a = newPhotoPublicId(familyId);
  const b = newPhotoPublicId(familyId);
  expect(a).not.toBe(b);
  expect(a).toMatch(/^families\/cmrivera\/[A-Za-z0-9_-]{22}$/);

  const now = 1_315_060_510_000;
  const { url, fields } = uploadFields(config, a, now);
  expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
  const signed = {
    allowed_formats: "jpg,png,webp,gif,heic,heif",
    overwrite: "false",
    public_id: a,
    timestamp: "1315060510",
    transformation: "c_limit,w_1600,fl_force_strip",
    type: "authenticated",
  };
  expect(fields).toEqual({ ...signed, api_key: "1234", signature: signParams(signed, "abcd") });
  expect(Object.keys(fields).sort()).toEqual(["allowed_formats", "api_key", "overwrite", "public_id", "signature", "timestamp", "transformation", "type"]);
});

it("puts the resize transformation on every delivery URL and never the original", () => {
  for (const publicId of ["families/cmrivera/aaaaaaaaaaaaaaaaaaaaaa", "sample", "families/other/bbbbbbbbbbbbbbbbbbbbbb"]) {
    const url = photoUrl(config, publicId);
    expect(url).toBe(
      `https://res.cloudinary.com/demo/image/authenticated/s--${signPath(`${DELIVERY_TRANSFORMATION}/${publicId}`, "abcd")}--/${DELIVERY_TRANSFORMATION}/${publicId}`,
    );
    expect(url).toContain("/c_limit,w_1600/f_auto/q_auto/");
    expect(url).not.toContain("fl_keep");
    expect(url).not.toContain("/image/upload/");
    expect(url.startsWith("https://res.cloudinary.com/demo/image/authenticated/s--")).toBe(true);
  }
});

it("accepts only this family's photo ids", () => {
  const suffix = "a".repeat(22);
  expect(isFamilyPhotoId("cmrivera", `families/cmrivera/${suffix}`)).toBe(true);
  expect(isFamilyPhotoId("a.b", `families/a.b/${suffix}`)).toBe(true);
  expect(isFamilyPhotoId("a.b", `families/aXb/${suffix}`)).toBe(false);
  expect(isFamilyPhotoId("cmrivera", `families/cmokafor/${suffix}`)).toBe(false);
  expect(isFamilyPhotoId("cmrivera", `families/cmrivera/${suffix}/extra`)).toBe(false);
  expect(isFamilyPhotoId("cmrivera", `families/cmrivera/${"a".repeat(21)}`)).toBe(false);
  expect(isFamilyPhotoId("cmrivera", `families/cmrivera/families/cmokafor`)).toBe(false);
  expect(isFamilyPhotoId("", `families//${suffix}`)).toBe(false);
});

it("asks Cloudinary to delete an authenticated photo and invalidate cached copies", async () => {
  const calls: { url: string; method: string; authorization: string | null; body: string; timedOut: boolean }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        method: init.method ?? "",
        authorization: new Headers(init.headers).get("authorization"),
        body: String(init.body),
        timedOut: init.signal !== undefined,
      });
      return new Response("{}", { status: 200 });
    }),
  );
  const publicId = "families/cmrivera/aaaaaaaaaaaaaaaaaaaaaa";
  await destroyPhotos(config, [publicId, "families/cmrivera/bbbbbbbbbbbbbbbbbbbbbb"]);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    url: "https://api.cloudinary.com/v1_1/demo/resources/image/authenticated",
    method: "DELETE",
    authorization: `Basic ${Buffer.from("1234:abcd").toString("base64")}`,
    timedOut: true,
  });
  expect(calls[0]!.body).toContain("invalidate=true");
  expect(calls[0]!.body).toContain(`public_ids%5B%5D=${encodeURIComponent(publicId)}`);
  expect(calls[1]!.body).toContain("public_ids%5B%5D=");
});

it("fails the delete when Cloudinary rejects it, without quoting the id in the error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
  const publicId = "families/cmrivera/aaaaaaaaaaaaaaaaaaaaaa";
  try {
    await destroyPhotos(config, [publicId]);
    expect.unreachable();
  } catch (err) {
    expect((err as Error).message).toBe("Couldn't delete 1 of 1 photos");
    expect((err as Error).message).not.toContain(publicId);
  }
});
