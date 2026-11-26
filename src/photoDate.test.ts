import { describe, expect, it } from "vitest";
import { datesFromRecord, earliest, fromLocalInput, parseExifDate, photoIds, readPhotoDate, recordFromDates, toLocalInput } from "./photoDate.js";

// A minimal JPEG whose Exif holds one DateTimeOriginal ("YYYY:MM:DD HH:MM:SS"), or none.
function jpeg(dateTimeOriginal?: string): Blob {
  const text = dateTimeOriginal ? new TextEncoder().encode(`${dateTimeOriginal}\0`) : null;
  const tiff: number[] = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8]; // big-endian header, IFD0 at 8
  if (text) {
    // IFD0: one entry, the Exif sub-IFD pointer (0x8769) to offset 26; then the Exif IFD with
    // one entry, DateTimeOriginal (0x9003, ASCII) at offset 44.
    tiff.push(0, 1, 0x87, 0x69, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0);
    tiff.push(0, 1, 0x90, 0x03, 0, 2, 0, 0, 0, text.length, 0, 0, 0, 44, 0, 0, 0, 0);
    tiff.push(...text);
  } else {
    tiff.push(0, 0, 0, 0, 0, 0);
  }
  const app1 = [...new TextEncoder().encode("Exif\0\0"), ...tiff];
  const length = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xd9];
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

describe("readPhotoDate", () => {
  it("reads the date a photo was taken, as the device's local time", async () => {
    expect(await readPhotoDate(jpeg("2019:03:03 15:30:00"))).toEqual(new Date(2019, 2, 3, 15, 30, 0));
  });

  it("returns null for a photo with no date", async () => {
    expect(await readPhotoDate(jpeg())).toBeNull();
  });

  it("returns null for something that isn't a photo, without throwing", async () => {
    expect(await readPhotoDate(new Blob(["not a photo"]))).toBeNull();
    expect(await readPhotoDate(new Blob([]))).toBeNull();
  });
});

describe("parseExifDate", () => {
  it("reads a camera's date as local time", () => {
    expect(parseExifDate("2019:03:03 15:30:00")).toEqual(new Date(2019, 2, 3, 15, 30, 0));
  });

  it("refuses zeros and impossible dates", () => {
    expect(parseExifDate("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDate("2019:02:31 10:00:00")).toBeNull();
    expect(parseExifDate("yesterday")).toBeNull();
    expect(parseExifDate("")).toBeNull();
  });
});

describe("photoIds", () => {
  it("finds uploaded photos at any depth, skipping placeholders and others", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "photo", attrs: { publicId: "a" } },
        { type: "blockquote", content: [{ type: "photo", attrs: { publicId: "b" } }] },
        { type: "photo", attrs: { placeholder: true } },
        { type: "paragraph", content: [{ type: "text", text: "hi" }] },
      ],
    };
    expect(photoIds(doc)).toEqual(["a", "b"]);
    expect(photoIds(null)).toEqual([]);
  });
});

describe("earliest", () => {
  it("picks the earliest date, ignoring photos without one", () => {
    const a = new Date(2020, 5, 1);
    const b = new Date(2018, 0, 15);
    expect(earliest([a, null, b, undefined])).toEqual(b);
  });

  it("is null when no photo has a date", () => {
    expect(earliest([])).toBeNull();
    expect(earliest([null, undefined])).toBeNull();
  });
});

describe("datetime-local values", () => {
  it("round-trips a date in the device's time zone", () => {
    const date = new Date(2019, 2, 3, 15, 30);
    expect(toLocalInput(date)).toBe("2019-03-03T15:30");
    expect(fromLocalInput("2019-03-03T15:30")).toEqual(date);
  });

  it("pads single digits and keeps old years", () => {
    expect(toLocalInput(new Date(1987, 0, 5, 7, 4))).toBe("1987-01-05T07:04");
  });

  it("returns null for empty or impossible values", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("2019-02-31T10:00")).toBeNull();
    expect(fromLocalInput("2019-03-03")).toBeNull();
  });
});

describe("photo dates sent and received", () => {
  const doc = { type: "doc", content: [{ type: "photo", attrs: { publicId: "a" } }, { type: "photo", attrs: { publicId: "b" } }] };
  it("round-trips the dates of the photos in the content, leaving out photos without one", () => {
    const received = datesFromRecord({ a: "2019-03-03T15:30:00.000Z", gone: "2018-01-01T00:00:00.000Z" });
    expect(recordFromDates(doc, received)).toEqual({ a: "2019-03-03T15:30:00.000Z" });
  });
  it("starts empty when the server sent none", () => {
    expect(datesFromRecord(undefined).size).toBe(0);
  });
});
