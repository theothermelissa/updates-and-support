import type { Doc, Photo } from "../src/lib/doc.js";
import { destroyPhotos, isFamilyPhotoId, photoUrl, type CloudinaryConfig } from "./cloudinary.js";
import type { Db } from "./db.js";
import type { SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";
import { destroyVideos, noteSelect, noteView, visibleNotes, type NoteView } from "./notes.js";
import { notifySupporters } from "./notifications.js";
import { NO_PHOTOS, type PhotoSettings } from "./photoSettings.js";
import { requireFamilyMember } from "./people.js";
import { reactionsView, visibleReactors, type ReactionsView } from "./reactions.js";
import { contentFrom, photoCount, shownContent, type PhotoCheck } from "./richText.js";
import { cloudinaryStore, type VideoStore } from "./videos.js";

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
export async function listUpdates(
  db: Db,
  person: Person,
  store: VideoStore = cloudinaryStore,
  settings: PhotoSettings = NO_PHOTOS,
): Promise<FeedUpdate[]> {
  const updates = await db.update.findMany({
    where: { familyId: person.familyId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      photos: { select: { publicId: true } },
      reactions: {
        where: visibleReactors(person.familyId),
        orderBy: { createdAt: "asc" },
        select: { kind: true, personId: true, person: { select: { name: true } } },
      },
      notes: { where: visibleNotes(person.familyId), orderBy: { createdAt: "desc" }, select: noteSelect(person.familyId) },
    },
  });
  return updates.map((u) => {
    const shown = view(u);
    return {
      ...shown,
      content: withPhotoLinks(shown.content, person.familyId, new Set(u.photos.map((p) => p.publicId)), settings.cloudinary ?? null),
      ...reactionsView(u.reactions, person.id),
      notes: u.notes.map((n) => noteView(n, person.id, store)),
    };
  });
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
  const { content, body } = contentFrom(input, settings, { familyId: person.familyId });
  const ids = [...publicIdsIn(content)];
  const update = await savePhoto(async () =>
    db.$transaction(async (tx) => {
      const created = await tx.update.create({
        data: { familyId: person.familyId, authorId: person.id, content, body },
        include: { author: { select: { name: true } } },
      });
      if (ids.length > 0) {
        await tx.photo.createMany({ data: ids.map((publicId) => ({ updateId: created.id, publicId })) });
      }
      return created;
    }),
  );
  if (notifyWith) {
    try {
      await notifySupporters(db, notifyWith, person.familyId, photoCount(content));
    } catch (err) {
      console.error(`Notifications failed for family ${person.familyId}: ${(err as Error).message}`);
    }
  }
  return view(update);
}

// Any family member may edit any update in their own family. The row stays locked until the
// new photo rows are written, so a delete can't take the same photos in between.
export async function editUpdate(
  db: Db,
  person: Person,
  id: string,
  input: { content?: unknown; body?: unknown },
  settings: PhotoSettings = NO_PHOTOS,
): Promise<UpdateView> {
  requireFamilyMember(person);
  const { update, dropped } = await savePhoto(() =>
    db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Update" WHERE id = ${id} AND "familyId" = ${person.familyId} FOR UPDATE`;
      if (!row) throw new RequestError(404, "Update not found");
      const existing = await tx.photo.findMany({ where: { updateId: id }, select: { publicId: true } });
      const kept = new Set(existing.map((p) => p.publicId));
      const check: PhotoCheck = { familyId: person.familyId, kept };
      const { content, body } = contentFrom(input, settings, check);
      const next = publicIdsIn(content);
      const removed = [...kept].filter((publicId) => !next.has(publicId));
      const added = [...next].filter((publicId) => !kept.has(publicId));
      if (removed.length > 0) await tx.photo.deleteMany({ where: { updateId: id, publicId: { in: removed } } });
      if (added.length > 0) {
        await tx.photo.createMany({ data: added.map((publicId) => ({ updateId: id, publicId })) });
      }
      const updated = await tx.update.update({
        where: { id },
        data: { content, body, editedAt: new Date() },
        include: { author: { select: { name: true } } },
      });
      return { update: updated, dropped: removed };
    }),
  );
  // After commit: a failed edit never reaches here, so it deletes nothing from Cloudinary.
  await forgetPhotos(settings, dropped, id);
  return view(update);
}

// Deletion is permanent: the row is removed, not hidden, with its reactions, notes, and photos.
// Note videos are deleted before the row, so a failure there leaves the update in place.
// Photos are deleted from Cloudinary after the commit, so a failure there still removes the update.
export async function deleteUpdate(
  db: Db,
  person: Person,
  id: string,
  store: VideoStore = cloudinaryStore,
  settings: PhotoSettings = NO_PHOTOS,
): Promise<void> {
  requireFamilyMember(person);
  const photoIds = await db.$transaction(
    async (tx) => {
      // Locks the update, so a note can't be attached while its videos are being deleted: a
      // note's insert waits on this lock and then finds the update gone. An edit waits too.
      const [update] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Update" WHERE id = ${id} AND "familyId" = ${person.familyId} FOR UPDATE`;
      if (!update) throw new RequestError(404, "Update not found");
      // Every note's video, including hidden notes by removed people, which the cascade deletes too.
      const notes = await tx.note.findMany({ where: { updateId: id, videoId: { not: null } }, select: { videoId: true } });
      await destroyVideos(store, notes.map((n) => n.videoId!));
      const photos = await tx.photo.findMany({ where: { updateId: id }, select: { publicId: true } });
      await tx.update.delete({ where: { id } });
      return photos.map((p) => p.publicId);
    },
    // Waits on the video host while holding the lock.
    { timeout: 30_000 },
  );
  await forgetPhotos(settings, photoIds, id);
}

// A photo already stored for another update hits the unique public id. Nothing is saved.
async function savePhoto<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof RequestError) throw err;
    if ((err as { code?: string }).code === "P2002") throw new RequestError(409, "That photo is already on an update");
    throw err;
  }
}

// The database change has already committed. Cloudinary being unreachable leaves the file
// behind; the photo is already gone from the app.
async function forgetPhotos(settings: PhotoSettings, publicIds: string[], updateId: string): Promise<void> {
  if (!settings.cloudinary || publicIds.length === 0) return;
  try {
    if (settings.destroy) await settings.destroy(publicIds);
    else await destroyPhotos(settings.cloudinary, publicIds);
  } catch {
    console.error(`Couldn't delete ${publicIds.length} photos from Cloudinary for update ${updateId}`);
  }
}

function publicIdsIn(doc: Doc): Set<string> {
  const ids = new Set<string>();
  for (const block of doc.content) {
    if (block.type === "photo" && "publicId" in block.attrs) ids.add(block.attrs.publicId);
  }
  return ids;
}

// A signed link only for a photo row on this update whose id belongs to this family.
// Anything else, including a placeholder, is a grey box.
function withPhotoLinks(doc: Doc, familyId: string, allowed: ReadonlySet<string>, config: CloudinaryConfig | null): Doc {
  return {
    type: "doc",
    content: doc.content.map((block) => (block.type === "photo" ? linkedPhoto(block, familyId, allowed, config) : block)),
  };
}

function linkedPhoto(photo: Photo, familyId: string, allowed: ReadonlySet<string>, config: CloudinaryConfig | null): Photo {
  if (!("publicId" in photo.attrs)) {
    return { type: "photo", attrs: { caption: photo.attrs.caption, placeholder: true, url: null } };
  }
  const { caption, publicId } = photo.attrs;
  const url = config && allowed.has(publicId) && isFamilyPhotoId(familyId, publicId) ? photoUrl(config, publicId) : null;
  return { type: "photo", attrs: { caption, publicId, url } };
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
