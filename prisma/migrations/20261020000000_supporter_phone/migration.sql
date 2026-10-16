-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "HelpRequest" ADD COLUMN     "requirePhone" BOOLEAN NOT NULL DEFAULT false;

-- Only supporters keep a phone number.
ALTER TABLE "Person" ADD CONSTRAINT "Person_phone_supporters_only" CHECK ("role" = 'supporter' OR "phone" IS NULL);
