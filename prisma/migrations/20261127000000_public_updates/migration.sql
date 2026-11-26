-- Public updates: a fourth audience, readable without signing in, behind a per-family switch.
ALTER TYPE "Audience" ADD VALUE 'public';

ALTER TABLE "Family" ADD COLUMN "publicUpdatesOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicNotice" TEXT;
