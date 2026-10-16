import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { ReactionKind, type Person } from "./generated/prisma/client.js";

const KINDS = Object.values(ReactionKind);

// What a viewer sees of one update's reactions: never other people's IDs or emails.
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

// Sets the signed-in person's one reaction to an update in their own family, replacing any
// other, or clears it with kind: null. Setting rather than toggling, so a repeated request
// leaves the same state.
export async function setReaction(
  db: Db,
  person: Person,
  input: { updateId?: unknown; kind?: unknown },
): Promise<void> {
  const { updateId, kind } = input;
  if (typeof updateId !== "string") throw new RequestError(400, "Expected an updateId");
  if (kind !== null && !KINDS.includes(kind as ReactionKind)) throw new RequestError(400, "Unknown reaction");

  // A plain read, so a removal can still land before the write; loading hides that reaction.
  const active = await db.person.findFirst({ where: { id: person.id, removedAt: null } });
  if (!active) throw new RequestError(403, "You can't react here");
  // Another family's update behaves like one that doesn't exist.
  const update = await db.update.findFirst({ where: { id: updateId, familyId: person.familyId } });
  if (!update) throw new RequestError(404, "Update not found");

  const key = { updateId, personId: person.id };
  if (kind === null) {
    await db.reaction.deleteMany({ where: key });
    return;
  }
  const upsert = () =>
    db.reaction.upsert({
      where: { updateId_personId: key },
      create: { ...key, kind: kind as ReactionKind },
      update: { kind: kind as ReactionKind },
    });
  try {
    await upsert();
  } catch (err) {
    const code = (err as { code?: string }).code;
    // A simultaneous request created the row first; this one replaces its reaction.
    if (code === "P2002") return void (await upsert());
    // The update was deleted a moment ago.
    if (code === "P2003") throw new RequestError(404, "Update not found");
    throw err;
  }
}

// Shapes one update's reactions, oldest first, for the viewer. The emoji used are listed
// most-used first, ties in the fixed order.
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
