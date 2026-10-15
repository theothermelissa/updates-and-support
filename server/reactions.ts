import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import { ReactionKind, type Person } from "./generated/prisma/client.js";

const KINDS = Object.values(ReactionKind);

// What a viewer sees of one update's reactions: never other people's IDs or emails.
// Nameless readers are counted but not named, and the viewer appears as `you`/`mine`
// rather than by name.
export type ReactionsView = {
  reactions: { kind: ReactionKind; count: number; names: string[]; mine: boolean }[];
  reactors: { count: number; names: string[]; you: boolean };
};

type LoadedReaction = { kind: ReactionKind; personId: string; person: { name: string | null } };

// Turns on or off one of the signed-in person's reactions to an update in their own family.
// Setting rather than toggling, so a repeated request leaves the same state.
export async function setReaction(
  db: Db,
  person: Person,
  input: { updateId?: unknown; kind?: unknown; on?: unknown },
): Promise<void> {
  const { updateId, kind, on } = input;
  if (typeof updateId !== "string") throw new RequestError(400, "Expected an updateId");
  if (!KINDS.includes(kind as ReactionKind)) throw new RequestError(400, "Unknown reaction");
  if (typeof on !== "boolean") throw new RequestError(400, "Expected on: true or false");

  // A plain read, so a removal can still land before the write; loading hides that reaction.
  const active = await db.person.findFirst({ where: { id: person.id, removedAt: null } });
  if (!active) throw new RequestError(403, "You can't react here");
  // Another family's update behaves like one that doesn't exist.
  const update = await db.update.findFirst({ where: { id: updateId, familyId: person.familyId } });
  if (!update) throw new RequestError(404, "Update not found");

  const key = { updateId, personId: person.id, kind: kind as ReactionKind };
  if (!on) {
    await db.reaction.deleteMany({ where: key });
    return;
  }
  try {
    await db.reaction.createMany({ data: key, skipDuplicates: true });
  } catch (err) {
    // The update was deleted a moment ago.
    if ((err as { code?: string }).code === "P2003") throw new RequestError(404, "Update not found");
    throw err;
  }
}

// Shapes one update's reactions, oldest first, for the viewer.
export function reactionsView(loaded: LoadedReaction[], viewerId: string): ReactionsView {
  const reactions = KINDS.flatMap((kind) => {
    const given = loaded.filter((r) => r.kind === kind);
    if (given.length === 0) return [];
    return [{ kind, count: given.length, names: namesOf(given, viewerId), mine: given.some((r) => r.personId === viewerId) }];
  });
  // Each person once, at their first reaction.
  const people = loaded.filter((r, i) => loaded.findIndex((o) => o.personId === r.personId) === i);
  return {
    reactions,
    reactors: { count: people.length, names: namesOf(people, viewerId), you: people.some((r) => r.personId === viewerId) },
  };
}

function namesOf(reactions: LoadedReaction[], viewerId: string): string[] {
  return reactions.flatMap((r) => (r.personId !== viewerId && r.person.name ? [r.person.name] : []));
}
