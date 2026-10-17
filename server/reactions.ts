import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";
import { noteReactionSet, visibleNotes } from "./notes.js";
import { requireFamilyMember } from "./people.js";
import { inCatalogOrder, MAX_REACTIONS, reactionFor } from "../src/lib/reactionCatalog.js";

// An update's set of reactions from a request: distinct catalog kinds, at most six, returned in
// catalog order so the same set is always stored the same way. Empty allows none.
export function parseReactionSet(input: unknown): string[] {
  if (!Array.isArray(input)) throw new RequestError(400, "Reactions must be a list");
  if (input.length > MAX_REACTIONS) throw new RequestError(400, `At most ${MAX_REACTIONS} reactions`);
  if (!input.every((k) => typeof k === "string" && reactionFor(k))) throw new RequestError(400, "Unknown reaction");
  if (new Set(input).size !== input.length) throw new RequestError(400, "A reaction is listed twice");
  return inCatalogOrder(input);
}

// What a viewer sees of one update's or note's reactions: never other people's IDs or emails.
// `named` lists the named people other than the viewer, oldest first; the viewer's own is
// `mine`, and nameless readers are only counted. `allowed` is what anyone may pick here.
export type ReactionsView = {
  reactions: {
    count: number;
    kinds: string[];
    mine: string | null;
    allowed: string[];
    named: { name: string; kind: string }[];
  };
};

type LoadedReaction = { kind: string; personId: string; person: { name: string | null } };

// Reactions shown with an update or a note: this family's people who haven't been removed.
// The read path applies it itself, rather than trusting how the reaction was written.
export function visibleReactors(familyId: string) {
  return { person: { familyId, removedAt: null } };
}

// Sets the signed-in person's one reaction to an update or a note in their own family,
// replacing any other, or clears it with kind: null. Exactly one target. A new reaction must
// be one the target allows: the update's own set, or the family's note set on a note. Clearing is
// always allowed, so anyone can take back a reaction the set no longer offers. Setting rather
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
  // A plain read, so a removal can still land before the write; loading hides that reaction.
  const active = await db.person.findFirst({ where: { id: person.id, removedAt: null } });
  if (!active) throw new RequestError(403, "You can't react here");

  const chosen = kind as string | null;
  if (hasUpdate) {
    // Another family's update behaves like one that doesn't exist.
    const update = await db.update.findFirst({ where: { id: updateId, familyId: person.familyId } });
    if (!update) throw new RequestError(404, "Update not found");
    if (chosen !== null && !update.reactionKinds.includes(chosen)) throw notAllowed();
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

  // A note that isn't shown, including another family's, behaves like one that doesn't exist.
  const note = await db.note.findFirst({
    where: { id: noteId as string, ...visibleNotes(person.familyId) },
  });
  if (!note) throw new RequestError(404, "Note not found");
  // visibleNotes put the note in the person's family, so this is the note's family's set.
  if (chosen !== null && !(await noteReactionSet(db, person.familyId)).includes(chosen)) throw notAllowed();
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

// A family member sets the emoji anyone may react with on their family's notes. Reactions
// already given stay, as when an update's set changes.
export async function setNoteReactions(
  db: Db,
  person: Person,
  input: { reactions?: unknown },
): Promise<{ reactions: string[] }> {
  requireFamilyMember(person);
  const kinds = parseReactionSet(input.reactions);
  const family = await db.family.update({
    where: { id: person.familyId },
    data: { noteReactionKinds: kinds },
    select: { noteReactionKinds: true },
  });
  return { reactions: family.noteReactionKinds };
}

// Includes a kind that isn't a string, or isn't in the catalog at all.
function notAllowed() {
  return new RequestError(400, "That reaction isn't available here");
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
// are listed most-used first, ties in catalog order. `allowed` is the target's set.
export function reactionsView(loaded: LoadedReaction[], viewerId: string, allowed: readonly string[]): ReactionsView {
  const used = (kind: string) => loaded.filter((r) => r.kind === kind).length;
  return {
    reactions: {
      count: loaded.length,
      kinds: inCatalogOrder([...new Set(loaded.map((r) => r.kind))]).sort((a, b) => used(b) - used(a)),
      mine: loaded.find((r) => r.personId === viewerId)?.kind ?? null,
      allowed: inCatalogOrder(allowed),
      named: loaded.flatMap((r) =>
        r.personId !== viewerId && r.person.name ? [{ name: r.person.name, kind: r.kind }] : [],
      ),
    },
  };
}
