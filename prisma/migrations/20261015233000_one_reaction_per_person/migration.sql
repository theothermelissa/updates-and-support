-- One reaction per person per update. Keep each person's most recent reaction to an update
-- and delete the rest, so the new unique index can be created.
DELETE FROM "Reaction" older
USING "Reaction" newer
WHERE older."updateId" = newer."updateId"
  AND older."personId" = newer."personId"
  AND (older."createdAt", older."id") < (newer."createdAt", newer."id");

-- DropIndex
DROP INDEX "Reaction_updateId_personId_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_updateId_personId_key" ON "Reaction"("updateId", "personId");
