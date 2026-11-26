import { api } from "./api.js";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_WIDTH = 1600;
const TOO_LARGE = "This photo is too large for this browser. Try Safari, or choose a JPEG copy.";

// What to upload: the shrunk photo when there is one, otherwise the original if the photo host
// will take it, otherwise a message to show. A GIF is never shrunk (it would stop moving).
export function choosePhoto<T>(input: { isGif: boolean; size: number; shrunk: T | null; original: T }):
  { photo: T } | { error: string } {
  if (!input.isGif && input.shrunk) return { photo: input.shrunk };
  if (input.size <= MAX_PHOTO_BYTES) return { photo: input.original };
  return { error: TOO_LARGE };
}

// A photo already small enough is uploaded as it is, so it isn't re-encoded for nothing.
export function needsShrink(width: number, size: number): boolean {
  return width > MAX_PHOTO_WIDTH || size > MAX_PHOTO_BYTES;
}

// Shrinks a photo on the device to at most 1600 pixels wide, as a JPEG. Null when the browser
// can't read the format (HEIC outside Safari), runs out of memory, or the photo is small already.
async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    if (!needsShrink(bitmap.width, file.size)) {
      bitmap.close();
      return null;
    }
    const scale = Math.min(1, MAX_PHOTO_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  } catch {
    return null;
  }
}

export async function preparePhoto(file: File): Promise<{ photo: Blob } | { error: string }> {
  const isGif = file.type === "image/gif";
  return choosePhoto<Blob>({
    isGif,
    size: file.size,
    shrunk: isGif ? null : await shrinkPhoto(file),
    original: file,
  });
}

type Ticket = { url: string; fields: Record<string, string>; error?: string };
// Asks for a signature, then uploads the file straight to Cloudinary. The file is sent without
// its name. Resolves to the public id the server chose; Cloudinary's link to the file is ignored.
export async function uploadPhoto(slug: string, file: Blob): Promise<string> {
  const { status, data } = await api<Ticket>(slug, "photo-upload", { method: "POST" });
  const publicId = data?.fields?.public_id;
  if (status >= 300 || !data?.url || !publicId) {
    throw new Error(data?.error ?? "The photo didn't upload. Please try again.");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(data.fields)) form.append(key, value);
  form.append("file", new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" }));

  let res: Response;
  try {
    res = await fetch(data.url, { method: "POST", body: form, referrerPolicy: "no-referrer" });
  } catch {
    throw new Error("The photo didn't upload. Check your connection and try again.");
  }
  if (!res.ok) throw new Error("The photo didn't upload. Please try again.");

  let body: { public_id?: unknown };
  try {
    body = (await res.json()) as { public_id?: unknown };
  } catch {
    throw new Error("The photo didn't upload. Please try again.");
  }
  // Only the id we signed. A different one, or Cloudinary's own link, is not the photo.
  if (body.public_id !== publicId) throw new Error("The photo didn't upload. Please try again.");
  return publicId;
}
