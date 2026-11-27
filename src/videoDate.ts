// The date a video says it was recorded, from its embedded details, read on the device before
// the video is uploaded. MP4 and MOV files keep a creation time (in the `mvhd` box inside
// `moov`) in UTC. Only box headers and the `moov` box are read, never the video itself, so a
// 100 MB file costs a few small reads. Any failure, a file of another format, no date, or a date
// after now is null, so reading never blocks an upload. The file's last-modified time
// is deliberately not used: a copied file would silently take the copy's date.
export async function readVideoDate(file: Blob, now = new Date()): Promise<Date | null> {
  try {
    const moov = await findBox(file, 0, file.size, "moov");
    if (!moov || moov.size > MAX_MOOV) return null;
    const mvhd = await findBox(file, moov.start, moov.end, "mvhd");
    if (!mvhd) return null;
    const bytes = await read(file, mvhd.start, Math.min(mvhd.end, mvhd.start + 12));
    // Version 0 stores the creation time in 4 bytes, version 1 in 8, after 4 bytes of version
    // and flags.
    const view = new DataView(bytes);
    const seconds = view.getUint8(0) === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4);
    return fromMovieSeconds(seconds, now);
  } catch {
    return null;
  }
}

// A cap that keeps a corrupt size from reading a whole file as one box.
const MAX_MOOV = 16 * 1024 * 1024;
// Seconds from 1904-01-01, where movie times start, to the Unix epoch.
const MOVIE_EPOCH_OFFSET = 2_082_844_800;

// Zero means "not set", and a date after now is a wrong clock. Movie times start in 1904, so
// none is before the earliest date the server takes.
export function fromMovieSeconds(seconds: number, now = new Date()): Date | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const time = (seconds - MOVIE_EPOCH_OFFSET) * 1000;
  return time > now.getTime() ? null : new Date(time);
}

async function read(file: Blob, start: number, end: number): Promise<ArrayBuffer> {
  return file.slice(start, end).arrayBuffer();
}

type Box = { start: number; end: number; size: number };

// The first box of this type between `from` and `to`, as the range of its contents.
async function findBox(file: Blob, from: number, to: number, type: string): Promise<Box | null> {
  let offset = from;
  while (offset + 8 <= to) {
    const view = new DataView(await read(file, offset, Math.min(to, offset + 16)));
    let size = view.getUint32(0);
    const name = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    let header = 8;
    if (size === 1) {
      if (view.byteLength < 16) return null;
      size = Number(view.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header || offset + size > to) return null;
    if (name === type) return { start: offset + header, end: offset + size, size: size - header };
    offset += size;
  }
  return null;
}
