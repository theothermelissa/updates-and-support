import { describe, expect, it } from "vitest";
import { fromMovieSeconds, readVideoDate } from "./videoDate.js";

const NOW = new Date("2026-11-26T12:00:00Z");
const toMovie = (iso: string) => Date.parse(iso) / 1000 + 2_082_844_800;

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = Uint8Array.from(parts.flatMap((p) => [...p]));
  const out = new Uint8Array(8 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(body, 8);
  return out;
}

function mvhd(seconds: number, version = 0): Uint8Array {
  const body = new Uint8Array(version === 1 ? 28 : 16);
  const view = new DataView(body.buffer);
  body[0] = version;
  if (version === 1) view.setBigUint64(4, BigInt(seconds));
  else view.setUint32(4, seconds);
  return box("mvhd", body);
}

const ftyp = box("ftyp", new Uint8Array(8));
const moov = (seconds: number, version = 0) => box("moov", mvhd(seconds, version));
const file = (...boxes: Uint8Array[]) => new Blob(boxes as BlobPart[]);

describe("readVideoDate", () => {
  it("reads the creation time of a version 0 header", async () => {
    const date = await readVideoDate(file(ftyp, moov(toMovie("2019-03-03T15:30:00Z"))), NOW);
    expect(date).toEqual(new Date("2019-03-03T15:30:00Z"));
  });

  it("reads a version 1 header", async () => {
    const date = await readVideoDate(file(ftyp, moov(toMovie("2019-03-03T15:30:00Z"), 1)), NOW);
    expect(date).toEqual(new Date("2019-03-03T15:30:00Z"));
  });

  it("finds a moov that comes after the video data", async () => {
    const mdat = box("mdat", new Uint8Array(3000));
    const date = await readVideoDate(file(ftyp, mdat, moov(toMovie("2020-01-02T03:04:05Z"))), NOW);
    expect(date).toEqual(new Date("2020-01-02T03:04:05Z"));
  });

  it.each([
    ["no moov", file(ftyp, box("mdat", new Uint8Array(100)))],
    ["a creation time of zero", file(ftyp, moov(0))],
    ["a date in the future", file(ftyp, moov(toMovie("2030-01-01T00:00:00Z")))],
    ["a size that runs past the file", new Blob([Uint8Array.from([0, 0, 255, 255, 109, 111, 111, 118])])],
    ["bytes that aren't a video", new Blob(["not a video at all"])],
    ["an empty file", new Blob([])],
  ])("gives null for %s", async (_name, blob) => {
    expect(await readVideoDate(blob, NOW)).toBeNull();
  });
});

describe("fromMovieSeconds", () => {
  it("is the Unix date for 1904-based seconds", () => {
    expect(fromMovieSeconds(2_082_844_800 + 86_400, NOW)).toEqual(new Date("1970-01-02T00:00:00Z"));
  });
});
