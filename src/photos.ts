import { api } from "./api.js";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function photoSizeMessage(file: { size: number }): string | null {
  if (file.size > MAX_PHOTO_BYTES) return "That photo is over 10 MB. Please choose a smaller one.";
  return null;
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
