// Browser-independent decisions for recording a video note in the page.

export const MAX_RECORDING_SECONDS = 60;
// Keeps a full minute near 20 MB.
export const VIDEO_BITS_PER_SECOND = 2_500_000;

// Safari and recent Chrome record mp4, Firefox webm. The video host converts any of them.
const TYPES = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

// The first recording format the browser supports, or null if it supports none.
export function recordingType(isTypeSupported: (type: string) => boolean): string | null {
  return TYPES.find((type) => isTypeSupported(type)) ?? null;
}

// A file name to match a recording's type.
export function recordingName(type: string): string {
  return type.startsWith("video/mp4") ? "video.mp4" : "video.webm";
}

// What to tell someone whose camera couldn't start, from the browser's error. `undefined`
// means the browser can't record here at all, such as some email apps' built-in browsers.
export function cameraProblem(error: unknown): string {
  if (error === undefined) {
    return "This browser can't record video here. Try opening the page in Safari or Chrome, or upload a video instead.";
  }
  switch ((error as { name?: string })?.name) {
    case "NotAllowedError":
      return "Camera access is turned off for this site. You can allow it in your browser's settings, or upload a video instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Your camera is being used by another app.";
    default:
      return "Your camera couldn't be started.";
  }
}

// "0:42 left" for the seconds remaining, rounded up so it never shows 0:00 while recording.
export function timeLeft(elapsedMs: number): string {
  const left = Math.max(0, Math.ceil(MAX_RECORDING_SECONDS - elapsedMs / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`;
}
