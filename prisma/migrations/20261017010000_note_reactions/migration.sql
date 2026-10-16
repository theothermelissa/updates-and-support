-- Folded hands is no longer a reaction. Drop those rows before replacing the enum,
-- which Postgres can't remove a value from.
DELETE FROM "Reaction" WHERE "kind" = 'pray';

CREATE TYPE "ReactionKind_new" AS ENUM ('heart', 'hug', 'strong', 'clap', 'party', 'laugh');

ALTER TABLE "Reaction" ALTER COLUMN "kind" TYPE "ReactionKind_new" USING ("kind"::text::"ReactionKind_new");

DROP TYPE "ReactionKind";

ALTER TYPE "ReactionKind_new" RENAME TO "ReactionKind";

-- A person's one reaction to a note. Deleting the note or the person deletes it.
CREATE TABLE "NoteReaction" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteReaction_noteId_personId_key" ON "NoteReaction"("noteId", "personId");

ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
