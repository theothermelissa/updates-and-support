import { RequestError } from "./errors.js";
import type { Audience, Person, Prisma } from "./generated/prisma/client.js";

// Who can see each update, and the writes that change it. The rule (visibleUpdates) and its
// inverse (canSeeUpdate) sit side by side, and nothing else re-states them.

// At most this many groups on one update: a family has at most 50.
const MAX_GROUPS = 50;

export const GROUP_GONE = "A group you chose was deleted. Please choose again.";

// An audience as a request gives it: everyone, one or more of the family's groups, or, only on
// an invite-only family, family members only.
export type AudienceInput = "everyone" | "family" | "public" | { groups: string[] };

// What a family member sees of an update's audience. An empty list is "Family members only".
// Only family members ever receive it.
export type AudienceView = "everyone" | "public" | { groups: { id: string; name: string }[] };

// The updates this person may see. Family members see every update in their family. A supporter
// sees those shared with everyone, and those shared with a group of their own family that they
// belong to while their email is verified and they aren't removed. Read from the database on
// every call, never from the session's copy of the person. Combine it with other conditions as
// `{ AND: [..., visibleUpdates(person)] }`, never by spreading, so a caller's own `OR` can't
// replace it.
export function visibleUpdates(person: Person): Prisma.UpdateWhereInput {
  if (person.role === "family") return { familyId: person.familyId };
  return {
    familyId: person.familyId,
    OR: [
      { audience: { in: ["everyone", "public"] } },
      {
        audience: "groups",
        groups: {
          some: {
            group: {
              familyId: person.familyId,
              members: {
                some: {
                  personId: person.id,
                  person: { emailVerifiedAt: { not: null }, removedAt: null },
                },
              },
            },
          },
        },
      },
    ],
  };
}

// The exact inverse: the people who match visibleUpdates for this loaded update. Everyone in the
// family for `everyone`; otherwise family members, and verified, active members of one of its
// groups (in this family). Callers add their own conditions, such as notifications' guards.
export function canSeeUpdate(update: { familyId: string; audience: Audience; groupIds: string[] }): Prisma.PersonWhereInput {
  // Public updates are seen by everyone signed in, like everyone ones.
  switch (update.audience) {
    case "everyone":
    case "public":
      return { familyId: update.familyId };
    case "groups":
      break;
    default:
      return assertNever(update.audience);
  }
  return {
    familyId: update.familyId,
    OR: [
      { role: "family" },
      {
        emailVerifiedAt: { not: null },
        removedAt: null,
        groupMemberships: { some: { groupId: { in: update.groupIds }, group: { familyId: update.familyId } } },
      },
    ],
  };
}

// Absent is undefined, which callers decide on. Otherwise "everyone", "family" (only for an
// invite-only family; elsewhere it's refused like any unknown value), or { groups } with 1 to
// 50 distinct ids. Whether the ids are this family's groups is checked by writeAudience, under
// the groups lock.
export function parseAudience(input: unknown, family: { inviteOnly: boolean }): AudienceInput | undefined {
  if (input === undefined) return undefined;
  if (input === "everyone") return "everyone";
  if (input === "public") return "public";
  if (input === "family" && family.inviteOnly) return "family";
  const groups = typeof input === "object" && input !== null ? (input as { groups?: unknown }).groups : undefined;
  if (!Array.isArray(groups)) throw new RequestError(400, 'Expected audience to be "everyone" or { groups }');
  if (groups.length === 0) throw new RequestError(400, "Choose at least one group");
  if (groups.length > MAX_GROUPS) throw new RequestError(400, `At most ${MAX_GROUPS} groups`);
  if (!groups.every((id) => typeof id === "string")) throw new RequestError(400, "Unknown group");
  if (new Set(groups).size !== groups.length) throw new RequestError(400, "A group is listed twice");
  return { groups: groups as string[] };
}

// Serializes every write to a family's groups, or to an update's audience, so a group deletion
// can't act on an audience that's changing under it. Taken first in the transaction, before any
// row lock, so the lock order is the same everywhere.
export async function lockGroups(tx: Prisma.TransactionClient, familyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('groups:' || ${familyId}))`;
}

// Sets an update's audience. Call after lockGroups, in the same transaction. A group that isn't
// this family's, including one deleted while the form was open, is refused. Family members only
// is groups with none listed. Public needs an active admin and the family's switch on, both read
// here under the lock, so neither a demotion nor turning the switch off can slip past it.
export async function writeAudience(
  tx: Prisma.TransactionClient,
  person: Person,
  updateId: string,
  audience: AudienceInput,
): Promise<void> {
  const familyId = person.familyId;
  if (audience === "public") await requirePublicAllowed(tx, person);
  const ids = typeof audience === "object" ? audience.groups : [];
  if (ids.length > 0) {
    const found = await tx.group.count({ where: { id: { in: ids }, familyId } });
    if (found !== ids.length) throw new RequestError(409, GROUP_GONE);
  }
  await tx.updateGroup.deleteMany({ where: { updateId } });
  if (ids.length > 0) await tx.updateGroup.createMany({ data: ids.map((groupId) => ({ updateId, groupId })) });
  await tx.update.update({ where: { id: updateId }, data: { audience: audienceColumn(audience) } });
}

// The stored column for a requested audience; writeAudience then stores its groups. Family
// members only is groups with none listed.
export function audienceColumn(audience: AudienceInput): Audience {
  if (typeof audience === "object") return "groups";
  switch (audience) {
    case "everyone":
      return "everyone";
    case "public":
      return "public";
    case "family":
      return "groups";
    default:
      return assertNever(audience);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled audience: ${JSON.stringify(value)}`);
}

export const PUBLIC_OFF = "Public updates are off.";

// Under the groups lock: the person is still an active admin of the family, and the family has
// public updates on. Read from the database, never from the copy of the person the request began with.
async function requirePublicAllowed(tx: Prisma.TransactionClient, person: Person): Promise<void> {
  const [row] = await tx.$queryRaw<{ role: string; isAdmin: boolean; removedAt: Date | null; on: boolean }[]>`
    SELECT p."role"::text AS role, p."isAdmin", p."removedAt", f."publicUpdatesOn" AS "on"
    FROM "Person" p JOIN "Family" f ON f.id = p."familyId"
    WHERE p.id = ${person.id} AND p."familyId" = ${person.familyId}`;
  if (!row || row.role !== "family" || !row.isAdmin || row.removedAt) {
    throw new RequestError(403, "Only admins can make an update public.");
  }
  if (!row.on) throw new RequestError(403, PUBLIC_OFF);
}

// The family's updates shared with this group and no other. Deleting the group would leave them
// family members only, unless the family chooses other groups for them.
export function sharedOnlyWith(familyId: string, groupId: string): Prisma.UpdateWhereInput {
  return { familyId, audience: "groups", groups: { some: { groupId }, every: { groupId } } };
}

// What to load for audienceView.
export const audienceInclude = {
  groups: { select: { group: { select: { id: true, name: true } } } },
} satisfies Prisma.UpdateInclude;

export type LoadedAudience = Prisma.UpdateGetPayload<{ include: typeof audienceInclude }>;

export function audienceView(update: Pick<LoadedAudience, "audience" | "groups">): AudienceView {
  if (update.audience === "everyone") return "everyone";
  if (update.audience === "public") return "public";
  const groups = update.groups.map(({ group }) => ({ id: group.id, name: group.name }));
  return { groups: groups.sort((a, b) => a.name.localeCompare(b.name)) };
}
