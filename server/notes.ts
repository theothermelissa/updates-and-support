import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { validName } from "./families.js";
import { NoteColor, type Person, type Prisma } from "./generated/prisma/client.js";
import { reactionsView, visibleReactors, type ReactionsView } from "./reactions.js";
import { cloudinaryStore, newPublicId, type VideoStore } from "./videos.js";

const COLORS = Object.values(NoteColor);
const MAX_BODY = 1_000;
// Notes one person may leave in an hour, so someone with the answer can't flood the wall.
const MAX_PER_HOUR = 20;
// Upload tickets one person may get in an hour, used or not, so no one can fill storage
// with uploads they never post.
const MAX_TICKETS_PER_HOUR = 20;
// The spec's 60 seconds, plus one for how containers round a video's length.
const MAX_SECONDS = 61;

// What a viewer sees of a note: the author's name, never their ID or email. `mine` lets the
// author delete it; `authorIsFamily` marks family members' notes, which a supporter can't
// fake by signing with a family member's name.
export type NoteView = {
  id: string;
  updateId: string;
  body: string;
  // Signed links for a video note, built only for someone allowed to see the note, or
  // `unavailable` when the video host can't make them, so one video can't break the page.
  video: { src: string; poster: string } | { unavailable: true } | null;
  color: NoteColor;
  authorName: string;
  authorIsFamily: boolean;
  createdAt: Date;
  mine: boolean;
} & ReactionsView;

// The notes anyone signed in to a family may see: on its updates, by its people, and not by
// someone removed. Filtered by the author's family too, rather than trusting how notes were
// written. The wall, the feed, and deletion all use it, so they can't drift apart.
export function visibleNotes(familyId: string): Prisma.NoteWhereInput {
  return { update: { familyId }, author: { familyId, removedAt: null } };
}

// What to load for a note's view, including reactions from this family's people who haven't
// been removed. The feed and the wall both use it, so they can't drift apart.
export function noteSelect(familyId: string) {
  return {
    id: true,
    updateId: true,
    body: true,
    videoId: true,
    color: true,
    createdAt: true,
    authorId: true,
    author: { select: { name: true, role: true } },
    reactions: {
      where: visibleReactors(familyId),
      orderBy: { createdAt: "asc" as const },
      select: { kind: true, personId: true, person: { select: { name: true } } },
    },
  } satisfies Prisma.NoteSelect;
}

type LoadedNote = Prisma.NoteGetPayload<{ select: ReturnType<typeof noteSelect> }>;

export function noteView(note: LoadedNote, viewerId: string, store: VideoStore): NoteView {
  return {
    id: note.id,
    updateId: note.updateId,
    body: note.body,
    video: note.videoId ? videoLinks(store, note.videoId) : null,
    color: note.color,
    // Notes are only written with a name.
    authorName: note.author.name ?? "",
    authorIsFamily: note.author.role === "family",
    createdAt: note.createdAt,
    mine: note.authorId === viewerId,
    ...reactionsView(note.reactions, viewerId),
  };
}

function videoLinks(store: VideoStore, publicId: string): NoteView["video"] {
  try {
    return store.urls(publicId);
  } catch (err) {
    console.error("Couldn't make video links", err);
    return { unavailable: true };
  }
}

// Gives the person a ticket to upload one video straight to the video host, and the signed
// fields for it. The server picks the public ID, and only this person can attach it to a note.
export async function issueVideoUpload(
  db: Db,
  person: Person,
  store: VideoStore = cloudinaryStore,
): Promise<{ publicId: string; url: string; fields: Record<string, string> }> {
  const publicId = newPublicId();
  // Signed first, so a video host that can't sign uses up no ticket.
  const params = await fromHost(() => store.uploadParams(publicId));
  await db.$transaction(async (tx) => {
    // Locks the person's row, as createNote does: a removal at the same moment lands first or
    // waits, and a burst of requests can't all pass the count at once.
    const [current] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Person"
      WHERE id = ${person.id} AND "familyId" = ${person.familyId} AND "removedAt" IS NULL
      FOR UPDATE`;
    if (!current) throw new RequestError(403, "You can't leave a note here");
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await tx.videoUpload.count({ where: { personId: person.id, createdAt: { gte: since } } });
    if (recent >= MAX_TICKETS_PER_HOUR) {
      throw new RequestError(429, "You've uploaded a lot of videos. Please try again later.");
    }
    await tx.videoUpload.create({ data: { publicId, personId: person.id } });
  });
  return { publicId, ...params };
}

// Runs a call to the video host, turning its failure, such as a misconfigured host, into a
// refusal the page can show rather than a crash.
async function fromHost<T>(call: () => T | Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    console.error("The video host failed", err);
    throw new RequestError(503, "Videos can't be posted right now. Please try again later.");
  }
}

// Leaves a note on an update in the person's own family: written, with a body, or a video,
// with the public ID of an upload ticket the person was given. A name in the body is saved
// on their record, replacing the one they had. Omitting it keeps the stored name. Someone
// with no name must send one. The note and the name are saved together, so a note that isn't
// saved leaves the name as it was. Returns the note and the name it's signed with.
export async function createNote(
  db: Db,
  person: Person,
  input: { updateId?: unknown; body?: unknown; video?: unknown; color?: unknown; name?: unknown },
  store: VideoStore = cloudinaryStore,
): Promise<{ note: NoteView; name: string }> {
  const { updateId, color } = input;
  if (typeof updateId !== "string") throw new RequestError(400, "Expected an updateId");
  if (input.video !== undefined && input.body !== undefined) {
    throw new RequestError(400, "A note has a body or a video, not both");
  }
  const videoId = input.video === undefined ? null : await validVideo(db, person, input.video, store);
  const body = videoId ? "" : validBody(input.body);
  if (!COLORS.includes(color as NoteColor)) throw new RequestError(400, "Unknown color");

  try {
    return await db.$transaction(async (tx) => {
      // Locks the author's row, re-read rather than trusting the session's copy. A removal at
      // the same moment either lands first, refusing this note, or waits until it's written.
      const [author] = await tx.$queryRaw<{ name: string | null }[]>`
        SELECT name FROM "Person"
        WHERE id = ${person.id} AND "familyId" = ${person.familyId} AND "removedAt" IS NULL
        FOR UPDATE`;
      if (!author) throw new RequestError(403, "You can't leave a note here");

      // Another family's update behaves like one that doesn't exist.
      const update = await tx.update.findFirst({ where: { id: updateId, familyId: person.familyId } });
      if (!update) throw new RequestError(404, "Update not found");

      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await tx.note.count({ where: { authorId: person.id, createdAt: { gte: since } } });
      if (recent >= MAX_PER_HOUR) {
        throw new RequestError(429, "You've left a lot of notes. Please try again later.");
      }

      const name = input.name === undefined && author.name ? author.name : validName(input.name);
      if (name !== author.name) await tx.person.update({ where: { id: person.id }, data: { name } });

      const note = await tx.note.create({
        data: { updateId, authorId: person.id, body, videoId, color: color as NoteColor },
        select: noteSelect(person.familyId),
      });
      return { note: noteView(note, person.id, store), name };
    });
  } catch (err) {
    // Caught outside the transaction, which these errors have already aborted. P2003: the
    // update was deleted a moment ago. P2002: the video is already on a note.
    const code = (err as { code?: string }).code;
    if (code === "P2003") throw new RequestError(404, "Update not found");
    if (code === "P2002") throw new RequestError(400, "That video is already on a note");
    throw err;
  }
}

// A video the person may attach: first a ticket issued to them, and only then, so the server
// never asks the shared video host about anything it didn't issue to this person, an
// uploaded video within the length limit.
async function validVideo(db: Db, person: Person, video: unknown, store: VideoStore): Promise<string> {
  if (typeof video !== "string") throw new RequestError(400, "Unknown video");
  const ticket = await db.videoUpload.findFirst({ where: { publicId: video, personId: person.id } });
  if (!ticket) throw new RequestError(400, "Unknown video");
  const uploaded = await fromHost(() => store.describe(video));
  if (!uploaded) throw new RequestError(400, "The video didn't finish uploading. Please try again.");
  if (uploaded.duration > MAX_SECONDS) throw new RequestError(400, "A video can be up to 60 seconds long");
  return video;
}

// Every visible note in the person's family, newest first, for the wall.
export async function listNotes(db: Db, person: Person, store: VideoStore = cloudinaryStore): Promise<NoteView[]> {
  const notes = await db.note.findMany({
    where: visibleNotes(person.familyId),
    orderBy: { createdAt: "desc" },
    select: noteSelect(person.familyId),
  });
  return notes.map((n) => noteView(n, person.id, store));
}

// A family member may delete any note in their family; anyone else only their own. A note
// they can't delete behaves like one that doesn't exist. A video note's video is deleted
// first, so a failure there leaves the note to try again rather than a video nobody can delete.
export async function deleteNote(db: Db, person: Person, id: string, store: VideoStore = cloudinaryStore): Promise<void> {
  const where = {
    id,
    ...visibleNotes(person.familyId),
    ...(person.role === "family" ? {} : { authorId: person.id }),
  };
  const note = await db.note.findFirst({ where, select: { videoId: true } });
  if (!note) throw new RequestError(404, "Note not found");
  if (note.videoId) await destroyVideos(store, [note.videoId]);
  const { count } = await db.note.deleteMany({ where });
  if (count === 0) throw new RequestError(404, "Note not found");
}

// Deletes videos from the host, turning its failure into a refusal the person can retry.
export async function destroyVideos(store: VideoStore, publicIds: string[]): Promise<void> {
  if (publicIds.length === 0) return;
  try {
    await store.destroy(publicIds);
  } catch (err) {
    console.error("Deleting videos failed", err);
    throw new RequestError(502, "Couldn't delete the video. Please try again.");
  }
}

function validBody(body: unknown): string {
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0 || text.length > MAX_BODY) {
    throw new RequestError(400, `A note must be 1 to ${MAX_BODY.toLocaleString("en-US")} characters`);
  }
  return text;
}
