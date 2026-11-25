// The date a photo says it was taken, from its embedded details, read on the device before the
// photo is uploaded (Cloudinary removes the details when it stores it). Any failure, including
// no details at all, is null, so reading never blocks an upload. Photos record the camera's
// local time without a time zone, so the date is in this device's.
export async function readPhotoDate(file: Blob): Promise<Date | null> {
  try {
    // Loaded here, so readers who never add a photo never download it.
    const { parse } = await import("exifr/dist/lite.esm.mjs");
    // The small build knows tags only by number and returns their raw text: 0x9003 is
    // DateTimeOriginal and 0x9004 is CreateDate, "YYYY:MM:DD HH:MM:SS".
    // The library's types don't list tag numbers there, though it accepts them.
    const options = {
      tiff: false,
      exif: [0x9003, 0x9004],
      translateKeys: false,
      translateValues: false,
      reviveValues: false,
    } as unknown as Parameters<typeof parse>[1];
    const tags = (await parse(await file.arrayBuffer(), options)) as Record<string, unknown> | undefined;
    for (const value of [tags?.[0x9003], tags?.[0x9004]]) {
      const date = typeof value === "string" ? parseExifDate(value) : null;
      if (date) return date;
    }
  } catch {
    // Unreadable, or not a photo format with details.
  }
  return null;
}

// "2019:03:03 15:30:00" as a date in this device's time zone. Cameras with nothing to say write
// zeros, and a text that isn't a real date, both of which are null.
export function parseExifDate(text: string): Date | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (year === 0 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

// The public IDs of the uploaded photos in an editor's document.
export function photoIds(doc: unknown): string[] {
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const { type, attrs, content } = node as { type?: unknown; attrs?: { publicId?: unknown }; content?: unknown };
    if (type === "photo" && typeof attrs?.publicId === "string") ids.push(attrs.publicId);
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(doc);
  return ids;
}

// The earliest of the dates found, or null when no photo has one.
export function earliest(dates: Iterable<Date | null | undefined>): Date | null {
  let found: Date | null = null;
  for (const date of dates) {
    if (date && (!found || date < found)) found = date;
  }
  return found;
}

const pad = (n: number) => String(n).padStart(2, "0");

// A `datetime-local` field's value for a date, in this device's time zone.
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The date a `datetime-local` value means in this device's time zone, or null when it's empty or
// not a date.
export function fromLocalInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getMonth() === month - 1 ? date : null;
}
