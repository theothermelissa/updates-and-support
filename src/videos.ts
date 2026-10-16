import { api } from "./api.js";

export const MAX_SECONDS = 60;
export const MAX_BYTES = 100 * 1024 * 1024;

// A video file's length in seconds, read from its metadata, or null if the browser can't tell.
// The server checks the length again after upload; this only spares a long upload.
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

// Why a file can't be posted, or null if it can.
export async function checkVideo(file: File): Promise<string | null> {
  if (!file.type.startsWith("video/")) return "That file isn't a video.";
  if (file.size > MAX_BYTES) return "That video is too large. Please choose one under 100 MB.";
  const seconds = await videoDuration(file);
  if (seconds !== null && seconds > MAX_SECONDS + 0.5) return "A video can be up to 60 seconds long.";
  return null;
}

type Ticket = { publicId: string; url: string; fields: Record<string, string> };

// Gets an upload ticket and uploads the file straight to the video host, reporting progress
// from 0 to 1. Resolves to the video's public ID, or rejects with a message to show.
export async function uploadVideo(slug: string, file: Blob, onProgress: (fraction: number) => void): Promise<string> {
  const { status, data } = await api<Ticket & { error?: string }>(slug, "notes/video", { method: "POST" });
  if (status >= 300) throw new Error(data?.error ?? "Something went wrong. Please try again.");

  const form = new FormData();
  for (const [key, value] of Object.entries(data.fields)) form.append(key, value);
  // A fixed name: the host keeps the original file name, which could say what the video is about.
  form.append("file", file, "video");

  // XMLHttpRequest, because fetch can't report upload progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", data.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error("The video didn't upload. Please try again."));
    xhr.onerror = () => reject(new Error("The video didn't upload. Check your connection and try again."));
    xhr.send(form);
  });
  return data.publicId;
}
