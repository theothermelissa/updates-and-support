import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { validName } from "./families.js";
import { NoteColor, type Person, type Prisma } from "./generated/prisma/client.js";

const COLORS = Object.values(NoteColor);
const MAX_BODY = 1_000;
// Notes one person may leave in an hour, so someone with the answer can't flood the wall.
const MAX_PER_HOUR = 20;

// What a viewer sees of a note: the author's name, never their ID or email. `mine` lets the
// author delete it; `authorIsFamily` marks family members' notes, which a supporter can't
// fake by signing with a family member's name.
export type NoteView = {
  id: string;
  updateId: string;
  body: string;
  color: NoteColor;
  authorName: string;
  authorIsFamily: boolean;
  createdAt: Date;
  mine: boolean;
};

// The notes anyone signed in to a family may see: on its updates, by its people, and not by
// someone removed. Filtered by the author's family too, rather than trusting how notes were
// written. The wall, the feed, and deletion all use it, so they can't drift apart.
export function visibleNotes(familyId: string): Prisma.NoteWhereInput {
  return { update: { familyId }, author: { familyId, removedAt: null } };
}

// What to load for a note's view.
export const noteSelect = {
  id: true,
  updateId: true,
  body: true,
  color: true,
  createdAt: true,
  authorId: true,
  author: { select: { name: true, role: true } },
} satisfies Prisma.NoteSelect;

type LoadedNote = Prisma.NoteGetPayload<{ select: typeof noteSelect }>;

export function noteView(note: LoadedNote, viewerId: string): NoteView {
  return {
    id: note.id,
    updateId: note.updateId,
    body: note.body,
    color: note.color,
    // Notes are only written with a name.
    authorName: note.author.name ?? "",
    authorIsFamily: note.author.role === "family",
    createdAt: note.createdAt,
    mine: note.authorId === viewerId,
  };
}

// Leaves a note on an update in the person's own family. A person without a name must give
// one, and it goes on their record; a person with a name signs with it and can't change it here.
// Returns the note and the name it's signed with, so the client can show the new name.
export async function createNote(
  db: Db,
  person: Person,
  input: { updateId?: unknown; body?: unknown; color?: unknown; name?: unknown },
): Promise<{ note: NoteView; name: string }> {
  const { updateId, color } = input;
  if (typeof updateId !== "string") throw new RequestError(400, "Expected an updateId");
  const body = validBody(input.body);
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

      const name = author.name ?? validName(input.name);
      if (!author.name) await tx.person.update({ where: { id: person.id }, data: { name } });

      const note = await tx.note.create({
        data: { updateId, authorId: person.id, body, color: color as NoteColor },
        select: noteSelect,
      });
      return { note: noteView(note, person.id), name };
    });
  } catch (err) {
    // The update was deleted a moment ago. Caught outside the transaction, which the
    // foreign-key error has already aborted.
    if ((err as { code?: string }).code === "P2003") throw new RequestError(404, "Update not found");
    throw err;
  }
}

// Every visible note in the person's family, newest first, for the wall.
export async function listNotes(db: Db, person: Person): Promise<NoteView[]> {
  const notes = await db.note.findMany({
    where: visibleNotes(person.familyId),
    orderBy: { createdAt: "desc" },
    select: noteSelect,
  });
  return notes.map((n) => noteView(n, person.id));
}

// A family member may delete any note in their family; anyone else only their own. A note
// they can't delete behaves like one that doesn't exist.
export async function deleteNote(db: Db, person: Person, id: string): Promise<void> {
  const { count } = await db.note.deleteMany({
    where: {
      id,
      ...visibleNotes(person.familyId),
      ...(person.role === "family" ? {} : { authorId: person.id }),
    },
  });
  if (count === 0) throw new RequestError(404, "Note not found");
}

function validBody(body: unknown): string {
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0 || text.length > MAX_BODY) {
    throw new RequestError(400, `A note must be 1 to ${MAX_BODY.toLocaleString("en-US")} characters`);
  }
  return text;
}
