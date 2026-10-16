import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { ReactionKind, type Person } from "./generated/prisma/client.js";

const KINDS = Object.values(ReactionKind);

// What a viewer sees of one update's or note's reactions: never other people's IDs or emails.
// `named` lists the named people other than the viewer, oldest first; the viewer's own is
// `mine`, and nameless readers are only counted.
export type ReactionsView = {
  reactions: {
    count: number;
    kinds: ReactionKind[];
    mine: ReactionKind | null;
    named: { name: string; kind: ReactionKind }[];
  };
};

type LoadedReaction = { kind: ReactionKind; personId: string; person: { name: string | null } };

// Reactions shown with an update or a note: this family's people who haven't been removed.
// The read path applies it itself, rather than trusting how the reaction was written.
export function visibleReactors(familyId: string) {
  return { person: { familyId, removedAt: null } };
}

// Sets the signed-in person's one reaction to an update or a note in their own family,
// replacing any other, or clears it with kind: null. Exactly one target. Setting rather
// than toggling, so a repeated request leaves the same state.
export async function setReaction(
  db: Db,
  person: Person,
  input: { updateId?: unknown; noteId?: unknown; kind?: unknown },
): Promise<void> {
  const { updateId, noteId, kind } = input;
  const hasUpdate = typeof updateId === "string";
  const hasNote = typeof noteId === "string";
  // Both, neither, or an id that isn't a string.
  if (hasUpdate === hasNote || (updateId !== undefined && !hasUpdate) || (noteId !== undefined && !hasNote)) {
    throw new RequestError(400, "Expected an updateId or a noteId");
  }
  if (kind !== null && !KINDS.includes(kind as ReactionKind)) throw new RequestError(400, "Unknown reaction");

  // A plain read, so a removal can still land before the write; loading hides that reaction.
  const active = await db.person.findFirst({ where: { id: person.id, removedAt: null } });
  if (!active) throw new RequestError(403, "You can't react here");

  const chosen = kind as ReactionKind | null;
  if (hasUpdate) {
    // Another family's update behaves like one that doesn't exist.
    const update = await db.update.findFirst({ where: { id: updateId, familyId: person.familyId } });
    if (!update) throw new RequestError(404, "Update not found");
    const key = { updateId, personId: person.id };
    await write(
      () =>
        chosen === null
          ? db.reaction.deleteMany({ where: key })
          : db.reaction.upsert({
              where: { updateId_personId: key },
              create: { ...key, kind: chosen },
              update: { kind: chosen },
            }),
      "Update not found",
    );
    return;
  }

  // The same conditions as visibleNotes: this family's note, by someone who hasn't been
  // removed. Repeated here because notes.ts imports this file. A note that isn't shown,
  // including another family's, behaves like one that doesn't exist.
  const note = await db.note.findFirst({
    where: {
      id: noteId as string,
      update: { familyId: person.familyId },
      author: { familyId: person.familyId, removedAt: null },
    },
  });
  if (!note) throw new RequestError(404, "Note not found");
  const key = { noteId: noteId as string, personId: person.id };
  await write(
    () =>
      chosen === null
        ? db.noteReaction.deleteMany({ where: key })
        : db.noteReaction.upsert({
            where: { noteId_personId: key },
            create: { ...key, kind: chosen },
            update: { kind: chosen },
          }),
    "Note not found",
  );
}

// Runs a write, and retries once if a simultaneous request created the row first. The
// target disappearing between the check and the write is a 404.
async function write(run: () => Promise<unknown>, missing: string): Promise<void> {
  try {
    await run();
  } catch (err) {
    const code = (err as { code?: string }).code;
    // A simultaneous request created the row first; this one replaces its reaction.
    if (code === "P2002") return void (await run());
    if (code === "P2003") throw new RequestError(404, missing);
    throw err;
  }
}

// Shapes one update's or note's reactions, oldest first, for the viewer. The emoji used
// are listed most-used first, ties in the fixed order.
export function reactionsView(loaded: LoadedReaction[], viewerId: string): ReactionsView {
  const used = (kind: ReactionKind) => loaded.filter((r) => r.kind === kind).length;
  return {
    reactions: {
      count: loaded.length,
      kinds: KINDS.filter((k) => used(k) > 0).sort((a, b) => used(b) - used(a)),
      mine: loaded.find((r) => r.personId === viewerId)?.kind ?? null,
      named: loaded.flatMap((r) =>
        r.personId !== viewerId && r.person.name ? [{ name: r.person.name, kind: r.kind }] : [],
      ),
    },
  };
}
