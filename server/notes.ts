import { visibleUpdates } from "./audience.js";
import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { validName } from "./families.js";
import { NoteColor, type Person, type Prisma } from "./generated/prisma/client.js";
import { requireAdmin } from "./people.js";
import { reactionsView, visibleReactors, type ReactionsView } from "./reactions.js";
import { authorScope, readerScope, type ReaderScope } from "./readerScope.js";
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
  // Only for a family member viewing: whether the note is for family members only.
  familyOnly?: boolean;
} & ReactionsView;

// The notes this person may see: on updates they may see (see visibleUpdates), by their
// family's people, and not by someone removed. Filtered by the author's family too, rather than
// trusting how notes were written. A supporter also sees only notes by people in their scope
// (see readerScope) and none that are for family members only. The wall, the feed, reactions,
// and deletion all use it, so they can't drift apart.
export function visibleNotes(person: Person, scope: ReaderScope): Prisma.NoteWhereInput {
  const base: Prisma.NoteWhereInput = {
    update: visibleUpdates(person),
    author: { familyId: person.familyId, removedAt: null },
  };
  if (scope.isFamily) return base;
  return { AND: [base, { familyOnly: false }, { authorId: { in: [...scope.seenIds] } }] };
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
    familyOnly: true,
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

// The emoji anyone may react with on the family's notes. Read by the person's own family
// rather than the family loaded from the address, which a redirect can point elsewhere.
export async function noteReactionSet(db: Pick<Db, "family">, familyId: string): Promise<string[]> {
  const family = await db.family.findUniqueOrThrow({ where: { id: familyId }, select: { noteReactionKinds: true } });
  return family.noteReactionKinds;
}

// `allowed` is the family's note set, from noteReactionSet.
export function noteView(
  note: LoadedNote,
  viewerId: string,
  store: VideoStore,
  allowed: readonly string[],
  scope: ReaderScope,
): NoteView {
  return {
    id: note.id,
    updateId: note.updateId,
    body: note.body,
    video: note.videoId ? shownVideo(store, note.videoId) : null,
    color: note.color,
    // Notes are only written with a name.
    authorName: note.author.name ?? "",
    authorIsFamily: note.author.role === "family",
    createdAt: note.createdAt,
    mine: note.authorId === viewerId,
    ...(scope.isFamily ? { familyOnly: note.familyOnly } : {}),
    ...reactionsView(note.reactions, viewerId, allowed, scope),
  };
}

// Signed links for someone allowed to see the video, or `unavailable` when the host can't
// make them, so one video can't break the page. Notes and updates both use it.
export function shownVideo(store: VideoStore, publicId: string): { src: string; poster: string } | { unavailable: true } {
  try {
    return store.urls(publicId);
  } catch (err) {
    console.error("Couldn't make video links", err);
    return { unavailable: true };
  }
}

// Gives the person a ticket to upload one video straight to the video host, and the signed
// fields for it. The server picks the public ID, and only this person can attach it to a note
// or an update.
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
  input: { updateId?: unknown; body?: unknown; video?: unknown; color?: unknown; name?: unknown; audience?: unknown },
  store: VideoStore = cloudinaryStore,
): Promise<{ note: NoteView; name: string }> {
  const { updateId, color } = input;
  // A family member must choose, so a slip in the form can't widen a note; a supporter can't.
  if (person.role === "family") {
    if (input.audience !== "everyone" && input.audience !== "family") {
      throw new RequestError(400, "Choose who sees this note.");
    }
  } else if (input.audience !== undefined) {
    throw new RequestError(400, "Only family members choose who sees a note.");
  }
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

      // Another family's update behaves like one that doesn't exist. Shared-locked, so an edit
      // turning notes off, or a delete, finishes first and this sees its result; notes being
      // left at the same moment don't wait on each other.
      const [update] = await tx.$queryRaw<{ allowNotes: boolean }[]>`
        SELECT "allowNotes" FROM "Update" WHERE id = ${updateId} AND "familyId" = ${person.familyId} FOR SHARE`;
      if (!update) throw new RequestError(404, "Update not found");
      // An update outside the person's audience behaves like one that doesn't exist. Checked
      // before notes being off and the hourly limit, which would otherwise reveal it.
      const visible = await tx.update.count({ where: { AND: [{ id: updateId }, visibleUpdates(person)] } });
      if (visible === 0) throw new RequestError(404, "Update not found");
      if (!update.allowNotes) throw new RequestError(403, "Notes are turned off for this update");

      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await tx.note.count({ where: { authorId: person.id, createdAt: { gte: since } } });
      if (recent >= MAX_PER_HOUR) {
        throw new RequestError(429, "You've left a lot of notes. Please try again later.");
      }

      if (videoId) await lockUnusedVideo(tx, person.id, videoId);

      const name = input.name === undefined && author.name ? author.name : validName(input.name);
      if (name !== author.name) await tx.person.update({ where: { id: person.id }, data: { name } });

      const note = await tx.note.create({
        data: { updateId, authorId: person.id, body, videoId, color: color as NoteColor, familyOnly: input.audience === "family" },
        select: noteSelect(person.familyId),
      });
      const allowed = await noteReactionSet(tx, person.familyId);
      return { note: noteView(note, person.id, store, allowed, authorScope(person)), name };
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

// A video the person may attach to a note: their ticket, then an uploaded video within a minute.
function validVideo(db: Db, person: Person, video: unknown, store: VideoStore): Promise<string> {
  return claimVideo(db, person, video, store, { maxSeconds: MAX_SECONDS });
}

// A video the person may attach: first a ticket issued to them, and only then, so the server
// never asks the shared video host about anything it didn't issue to this person, an uploaded
// video within the limits it was given. Notes pass a length; updates pass a size.
export async function claimVideo(
  db: Db,
  person: Person,
  video: unknown,
  store: VideoStore,
  limits: { maxSeconds?: number; maxBytes?: number },
): Promise<string> {
  if (typeof video !== "string") throw new RequestError(400, "Unknown video");
  const ticket = await db.videoUpload.findFirst({ where: { publicId: video, personId: person.id } });
  if (!ticket) throw new RequestError(400, "Unknown video");
  const uploaded = await fromHost(() => store.describe(video));
  if (!uploaded) throw new RequestError(400, "The video didn't finish uploading. Please try again.");
  if (limits.maxSeconds !== undefined && uploaded.duration > limits.maxSeconds) {
    throw new RequestError(400, "A video can be up to 60 seconds long");
  }
  if (limits.maxBytes !== undefined && (uploaded.bytes === null || uploaded.bytes > limits.maxBytes)) {
    throw new RequestError(
      400,
      uploaded.bytes !== null && uploaded.bytes > limits.maxBytes
        ? "That video is too large. Please choose one under 100 MB."
        : "The video didn't finish uploading. Please try again.",
    );
  }
  return video;
}

// Locks the person's ticket, then refuses it if a note or an update already has it. The lock
// makes two attaches of the same ticket take turns, so the check can't pass for both.
export async function lockUnusedVideo(tx: Prisma.TransactionClient, personId: string, publicId: string): Promise<void> {
  const [ticket] = await tx.$queryRaw<{ publicId: string }[]>`
    SELECT "publicId" FROM "VideoUpload"
    WHERE "publicId" = ${publicId} AND "personId" = ${personId}
    FOR UPDATE`;
  if (!ticket) throw new RequestError(400, "Unknown video");
  const note = await tx.note.findFirst({ where: { videoId: publicId }, select: { id: true } });
  const update = await tx.update.findFirst({ where: { videoId: publicId }, select: { id: true } });
  if (note || update) throw new RequestError(400, "That video is already posted");
}

// Every visible note in the person's family, newest first, for the wall.
export async function listNotes(db: Db, person: Person, store: VideoStore = cloudinaryStore): Promise<NoteView[]> {
  const scope = await readerScope(db, person);
  const notes = await db.note.findMany({
    where: visibleNotes(person, scope),
    orderBy: { createdAt: "desc" },
    select: noteSelect(person.familyId),
  });
  const allowed = await noteReactionSet(db, person.familyId);
  return notes.map((n) => noteView(n, person.id, store, allowed, scope));
}

// A family member may delete any note in their family; anyone else only their own. A note
// they can't delete behaves like one that doesn't exist. A video note's video is deleted
// first, so a failure there leaves the note to try again rather than a video nobody can delete.
export async function deleteNote(db: Db, person: Person, id: string, store: VideoStore = cloudinaryStore): Promise<void> {
  const scope = await readerScope(db, person);
  const where: Prisma.NoteWhereInput = {
    AND: [{ id }, visibleNotes(person, scope), person.role === "family" ? {} : { authorId: person.id }],
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

// An admin sets whether "Allow notes" starts checked when anyone in the family posts.
// Updates already posted keep their own setting.
export async function setAllowNotesByDefault(
  db: Db,
  person: Person,
  input: { allowNotesByDefault?: unknown },
): Promise<{ allowNotesByDefault: boolean }> {
  requireAdmin(person);
  if (typeof input.allowNotesByDefault !== "boolean") {
    throw new RequestError(400, "Expected allowNotesByDefault to be true or false");
  }
  return db.family.update({
    where: { id: person.familyId },
    data: { allowNotesByDefault: input.allowNotesByDefault },
    select: { allowNotesByDefault: true },
  });
}
