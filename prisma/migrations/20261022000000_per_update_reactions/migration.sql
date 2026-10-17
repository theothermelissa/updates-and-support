-- Reactions become catalog kinds stored as text; the existing six keep their keys.
ALTER TABLE "Reaction" ALTER COLUMN "kind" TYPE TEXT USING "kind"::TEXT;
ALTER TABLE "NoteReaction" ALTER COLUMN "kind" TYPE TEXT USING "kind"::TEXT;
DROP TYPE "ReactionKind";

-- Each update's own set; existing updates get the usual six.
ALTER TABLE "Update" ADD COLUMN "reactionKinds" TEXT[] DEFAULT ARRAY['heart', 'hug', 'strong', 'clap', 'party', 'laugh']::TEXT[];
