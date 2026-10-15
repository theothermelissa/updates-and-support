-- AlterTable
ALTER TABLE "Person" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- A supporter who has only answered the question has neither a name nor an email; everyone
-- else has both. Only an email that exists can be verified, and family members always have one.
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_name_with_email" CHECK (("name" IS NULL) = ("email" IS NULL)),
  ADD CONSTRAINT "Person_family_has_email" CHECK ("role" = 'supporter' OR "email" IS NOT NULL),
  ADD CONSTRAINT "Person_verified_has_email" CHECK ("emailVerifiedAt" IS NULL OR "email" IS NOT NULL);
