import type { Doc } from "../src/lib/doc.js";
import type { Db } from "./db.js";
import type { SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";
import { noteSelect, noteView, visibleNotes, type NoteView } from "./notes.js";
import { notifySupporters } from "./notifications.js";
import { NO_PHOTOS, type PhotoSettings } from "./photoSettings.js";
import { requireFamilyMember } from "./people.js";
import { reactionsView, type ReactionsView } from "./reactions.js";
import { contentFrom, photoCount, shownContent } from "./richText.js";

export type UpdateView = {
  id: string;
  // Plain text, for the wall's excerpts.
  body: string;
  content: Doc;
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
};

export type FeedUpdate = UpdateView & ReactionsView & { notes: NoteView[] };

// Everyone signed in to the family reads every update, newest first, with its reactions and
// its notes, newest first.
// Reactions are filtered by family on their own, rather than trusting how they were written,
// and a removed person's reactions are hidden until they're restored.
export async function listUpdates(db: Db, person: Person): Promise<FeedUpdate[]> {
  const updates = await db.update.findMany({
    where: { familyId: person.familyId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      reactions: {
        where: { person: { familyId: person.familyId, removedAt: null } },
        orderBy: { createdAt: "asc" },
        select: { kind: true, personId: true, person: { select: { name: true } } },
      },
      notes: { where: visibleNotes(person.familyId), orderBy: { createdAt: "desc" }, select: noteSelect },
    },
  });
  return updates.map((u) => ({
    ...view(u),
    ...reactionsView(u.reactions, person.id),
    notes: u.notes.map((n) => noteView(n, person.id)),
  }));
}

// With a sender, also emails supporters that there's a new update. The update is saved
// first and stays posted even if the emails fail.
export async function createUpdate(
  db: Db,
  person: Person,
  input: { content?: unknown; body?: unknown },
  notifyWith?: SendEmails,
  settings: PhotoSettings = NO_PHOTOS,
): Promise<UpdateView> {
  requireFamilyMember(person);
  const { content, body } = contentFrom(input, settings);
  const update = await db.update.create({
    data: { familyId: person.familyId, authorId: person.id, content, body },
    include: { author: { select: { name: true } } },
  });
  if (notifyWith) {
    try {
      await notifySupporters(db, notifyWith, person.familyId, photoCount(content));
    } catch (err) {
      console.error(`Notifications failed for family ${person.familyId}: ${(err as Error).message}`);
    }
  }
  return view(update);
}

// Any family member may edit any update in their own family.
export async function editUpdate(
  db: Db,
  person: Person,
  id: string,
  input: { content?: unknown; body?: unknown },
  settings: PhotoSettings = NO_PHOTOS,
): Promise<UpdateView> {
  requireFamilyMember(person);
  const { content, body } = contentFrom(input, settings);
  // Scoped by family: another family's update ID behaves like one that doesn't exist.
  const { count } = await db.update.updateMany({
    where: { id, familyId: person.familyId },
    data: { content, body, editedAt: new Date() },
  });
  if (count === 0) throw new RequestError(404, "Update not found");
  const update = await db.update.findUniqueOrThrow({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  return view(update);
}

// Deletion is permanent: the row is removed, not hidden, with its reactions and notes.
export async function deleteUpdate(db: Db, person: Person, id: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.update.deleteMany({ where: { id, familyId: person.familyId } });
  if (count === 0) throw new RequestError(404, "Update not found");
}

function view(update: {
  id: string;
  body: string;
  content: unknown;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string | null };
}): UpdateView {
  return {
    id: update.id,
    body: update.body,
    content: shownContent(update.content, update.body),
    // Authors are family members, who always have a name.
    authorName: update.author.name ?? "",
    createdAt: update.createdAt,
    editedAt: update.editedAt,
  };
}
