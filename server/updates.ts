import { blocksFrom, bodyOf, type Block } from "./blocks.js";
import type { Db } from "./db.js";
import type { SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";
import { notifySupporters } from "./notifications.js";
import { requireFamilyMember } from "./people.js";
import { reactionsView, type ReactionsView } from "./reactions.js";

export type UpdateView = {
  id: string;
  blocks: Block[];
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
};

export type FeedUpdate = UpdateView & ReactionsView;

// What a post or edit sends: `blocks`, or `body` from pages loaded before blocks existed.
export type Content = { blocks?: unknown; body?: unknown };

const WITH_BLOCKS = {
  author: { select: { name: true } },
  blocks: { orderBy: { position: "asc" }, select: { text: true } },
} as const;

// Everyone signed in to the family reads every update, newest first, with its reactions.
// Reactions are filtered by family on their own, rather than trusting how they were written,
// and a removed person's reactions are hidden until they're restored.
export async function listUpdates(db: Db, person: Person): Promise<FeedUpdate[]> {
  const updates = await db.update.findMany({
    where: { familyId: person.familyId },
    orderBy: { createdAt: "desc" },
    include: {
      ...WITH_BLOCKS,
      reactions: {
        where: { person: { familyId: person.familyId, removedAt: null } },
        orderBy: { createdAt: "asc" },
        select: { kind: true, personId: true, person: { select: { name: true } } },
      },
    },
  });
  return updates.map((u) => ({ ...view(u), ...reactionsView(u.reactions, person.id) }));
}

// With a sender, also emails supporters that there's a new update. The update is saved
// first and stays posted even if the emails fail.
export async function createUpdate(
  db: Db,
  person: Person,
  content: Content,
  notifyWith?: SendEmails,
): Promise<UpdateView> {
  requireFamilyMember(person);
  const blocks = blocksFrom(content);
  const update = await db.update.create({
    data: {
      familyId: person.familyId,
      authorId: person.id,
      body: bodyOf(blocks),
      blocks: { create: rows(blocks) },
    },
    include: WITH_BLOCKS,
  });
  if (notifyWith) {
    try {
      await notifySupporters(db, notifyWith, person.familyId);
    } catch (err) {
      console.error(`Notifications failed for family ${person.familyId}: ${(err as Error).message}`);
    }
  }
  return view(update);
}

// Any family member may edit any update in their own family. The update is locked while
// its blocks are replaced, so two edits at once can't leave both sets of blocks.
export async function editUpdate(db: Db, person: Person, id: string, content: Content): Promise<UpdateView> {
  requireFamilyMember(person);
  const blocks = blocksFrom(content);
  const found = await db.$transaction(async (tx) => {
    // Scoped by family: another family's update ID behaves like one that doesn't exist.
    const locked = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "Update" WHERE id = ${id} AND "familyId" = ${person.familyId} FOR UPDATE`;
    if (locked.length === 0) return false;
    await tx.block.deleteMany({ where: { updateId: id } });
    await tx.block.createMany({ data: rows(blocks).map((row) => ({ ...row, updateId: id })) });
    await tx.update.update({ where: { id }, data: { body: bodyOf(blocks), editedAt: new Date() } });
    return true;
  });
  if (!found) throw new RequestError(404, "Update not found");
  const update = await db.update.findUniqueOrThrow({ where: { id }, include: WITH_BLOCKS });
  return view(update);
}

// Deletion is permanent: the row is removed, not hidden.
export async function deleteUpdate(db: Db, person: Person, id: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.update.deleteMany({ where: { id, familyId: person.familyId } });
  if (count === 0) throw new RequestError(404, "Update not found");
}

function rows(blocks: Block[]) {
  return blocks.map((block, position) => ({ position, kind: "text" as const, text: block.text }));
}

function view(update: {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string | null };
  blocks: { text: string | null }[];
}): UpdateView {
  return {
    id: update.id,
    // An update posted by the version before blocks, while blocks were being added, has none.
    blocks:
      update.blocks.length > 0
        ? update.blocks.map((b) => ({ type: "text", text: b.text ?? "" }))
        : [{ type: "text", text: update.body }],
    // Authors are family members, who always have a name.
    authorName: update.author.name ?? "",
    createdAt: update.createdAt,
    editedAt: update.editedAt,
  };
}
