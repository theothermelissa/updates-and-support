-- Family members only: admins manage the family. Every existing family member becomes an
-- admin, so no family loses any power.
ALTER TABLE "Person" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Person" SET "isAdmin" = true WHERE "role" = 'family';
ALTER TABLE "Person" ADD CONSTRAINT "Person_isAdmin_family_only" CHECK (NOT "isAdmin" OR "role" = 'family');
