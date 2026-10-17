-- The family's set of note reactions; existing families get the usual six.
ALTER TABLE "Family" ADD COLUMN "noteReactionKinds" TEXT[] DEFAULT ARRAY['heart', 'hug', 'strong', 'clap', 'party', 'laugh']::TEXT[];
