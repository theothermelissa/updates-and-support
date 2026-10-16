import { describe, expect, it } from "vitest";
import { cameraProblem, recordingName, recordingType, timeLeft } from "./recorder.js";

describe("recordingType", () => {
  it("prefers mp4, falls back to webm, and returns null when nothing is supported", () => {
    expect(recordingType(() => true)).toBe("video/mp4");
    expect(recordingType((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(recordingType((t) => t === "video/webm")).toBe("video/webm");
    expect(recordingType(() => false)).toBeNull();
  });

  it("names the file to match", () => {
    expect(recordingName("video/mp4")).toBe("video.mp4");
    expect(recordingName("video/webm;codecs=vp9,opus")).toBe("video.webm");
  });
});

describe("cameraProblem", () => {
  it("explains each way the camera can fail", () => {
    expect(cameraProblem({ name: "NotAllowedError" })).toMatch(/turned off for this site/);
    expect(cameraProblem({ name: "NotFoundError" })).toMatch(/No camera/);
    expect(cameraProblem({ name: "OverconstrainedError" })).toMatch(/No camera/);
    expect(cameraProblem({ name: "NotReadableError" })).toMatch(/another app/);
    expect(cameraProblem(undefined)).toMatch(/can't record video here/);
    expect(cameraProblem(new Error("boom"))).toBe("Your camera couldn't be started.");
    expect(cameraProblem(null)).toBe("Your camera couldn't be started.");
  });
});

describe("timeLeft", () => {
  it("counts down from a minute, rounding up and never below zero", () => {
    expect(timeLeft(0)).toBe("1:00 left");
    expect(timeLeft(18_200)).toBe("0:42 left");
    expect(timeLeft(59_900)).toBe("0:01 left");
    expect(timeLeft(61_000)).toBe("0:00 left");
  });
});
