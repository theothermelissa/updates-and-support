import type { Doc, Photo } from "../src/lib/doc.js";
import { lockGroups } from "./audience.js";
import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Family, Person } from "./generated/prisma/client.js";
import { NO_PHOTOS, type PhotoSettings } from "./photoSettings.js";
import { parseBanner, requireAdmin } from "./people.js";
import { reactionsView, visibleReactors } from "./reactions.js";
import { shownContent } from "./richText.js";
import { withPhotoLinks } from "./updates.js";

// Updates an admin made public, for visitors who aren't signed in (see spec/updates.md, "Public
// updates"). Everything a visitor receives is built here from an explicit list of fields, so
// nothing else about an update, or anyone, can ride along.

export const PUBLIC_LIMIT = 20;

export type PublicUpdate = {
  id: string;
  content: Doc;
  createdAt: Date;
  // How many reacted and which emoji, most-used first. Never who.
  reactions: { count: number; kinds: string[] };
};

// The family's latest public updates, newest first. The family's own wording for the banner comes
// back only when there is at least one, so it is never sent to a visitor the page shows nothing to.
// Checked on every call: an update is public only while its row says so and the family's switch is
// on, and a photo link is made only for a row that just matched.
export async function listPublicUpdates(
  db: Db,
  family: Pick<Family, "id" | "publicNotice">,
  settings: PhotoSettings = NO_PHOTOS,
): Promise<{ updates: PublicUpdate[]; notice?: string | null }> {
  const rows = await db.update.findMany({
    where: { familyId: family.id, audience: "public", videoId: null, family: { publicUpdatesOn: true } },
    orderBy: { createdAt: "desc" },
    take: PUBLIC_LIMIT,
    select: {
      id: true,
      body: true,
      content: true,
      createdAt: true,
      photos: { select: { publicId: true } },
      reactions: {
        where: visibleReactors(family.id),
        orderBy: { createdAt: "asc" },
        select: { kind: true, personId: true, person: { select: { name: true } } },
      },
    },
  });
  const updates = rows.map((u) => {
    const { count, kinds } = reactionsView(u.reactions, "", [], { isFamily: false, seenIds: new Set() }).reactions;
    const linked = withPhotoLinks(
      shownContent(u.content, u.body),
      family.id,
      new Set(u.photos.map((p) => p.publicId)),
      settings.cloudinary ?? null,
    );
    return { id: u.id, content: withoutPhotoIds(linked), createdAt: u.createdAt, reactions: { count, kinds } };
  });
  return updates.length > 0 ? { updates, notice: family.publicNotice } : { updates };
}

// A photo's public ID holds the family's internal ID, so a visitor gets only its caption and link.
function withoutPhotoIds(doc: Doc): Doc {
  return {
    type: "doc",
    content: doc.content.map((block) =>
      block.type === "photo"
        ? ({ type: "photo", attrs: { caption: block.attrs.caption, url: block.attrs.url ?? null } } as unknown as Photo)
        : block,
    ),
  };
}

// An admin turns public updates on or off. Turning them off makes every public update an
// everyone update in the same transaction, under the lock every audience write takes, so no update
// is ever public while the switch is off, and a post racing it either lands first and is converted,
// or is refused. Turning them on makes nothing public.
export async function setPublicUpdates(
  db: Db,
  person: Person,
  input: { on?: unknown },
): Promise<{ on: boolean; converted: number }> {
  requireAdmin(person);
  if (typeof input.on !== "boolean") throw new RequestError(400, "Expected on as true or false.");
  const on = input.on;
  return db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    const converted = on
      ? 0
      : (await tx.update.updateMany({ where: { familyId: person.familyId, audience: "public" }, data: { audience: "everyone" } })).count;
    await tx.family.update({ where: { id: person.familyId }, data: { publicUpdatesOn: on } });
    return { on, converted };
  });
}

// An admin rewords the banner shown over the public updates. Empty returns to the standard wording.
export async function setPublicNotice(
  db: Db,
  person: Person,
  input: { publicNotice?: unknown },
): Promise<{ publicNotice: string | null }> {
  requireAdmin(person);
  const text = parseBanner(input.publicNotice, "publicNotice");
  return db.family.update({ where: { id: person.familyId }, data: { publicNotice: text }, select: { publicNotice: true } });
}
