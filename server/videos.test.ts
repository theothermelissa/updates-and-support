import { v2 as cloudinary } from "cloudinary";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cloudinaryStore } from "./videos.js";

// The store's calls must name authenticated videos: Cloudinary's defaults are public images,
// where a lookup or delete would miss the video and an upload would publish it.
describe("the Cloudinary store", () => {
  beforeAll(() => {
    cloudinary.config({ cloud_name: "demo", api_key: "key", api_secret: "secret" });
  });

  it("signs uploads as authenticated, never overwriting, with conversions in the background", () => {
    const { url, fields } = cloudinaryStore.uploadParams("folder/abc");
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    expect(fields).toMatchObject({ public_id: "folder/abc", type: "authenticated", overwrite: "false", eager_async: "true" });
    const { signature, api_key, ...signed } = fields;
    expect(api_key).toBe("key");
    expect(signature).toBe(cloudinary.utils.api_sign_request(signed, "secret"));
  });

  it("links only to signed conversions of the authenticated video, never the original", () => {
    const { src, poster } = cloudinaryStore.urls("folder/abc");
    for (const link of [src, poster]) {
      expect(link).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/video\/authenticated\/s--[^/]+--\/c_limit,/);
    }
    expect(src).toMatch(/\.mp4$/);
    expect(poster).toMatch(/\.jpg$/);
  });

  it("deletes authenticated videos and their cached copies", async () => {
    const remove = vi.spyOn(cloudinary.api, "delete_resources").mockResolvedValue({ deleted: {} });
    await cloudinaryStore.destroy(["folder/a", "folder/b"]);
    expect(remove).toHaveBeenCalledWith(["folder/a", "folder/b"], {
      resource_type: "video",
      type: "authenticated",
      invalidate: true,
    });
  });

  it("looks up only authenticated videos, treating a missing one as none", async () => {
    const lookup = vi.spyOn(cloudinary.api, "resource").mockResolvedValueOnce({ duration: 12.5 });
    expect(await cloudinaryStore.describe("folder/a")).toEqual({ duration: 12.5 });
    expect(lookup).toHaveBeenCalledWith("folder/a", { resource_type: "video", type: "authenticated", media_metadata: true });
    lookup.mockRejectedValueOnce({ error: { http_code: 404 } });
    expect(await cloudinaryStore.describe("folder/missing")).toBeNull();
  });
});
