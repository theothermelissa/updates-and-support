-- AlterTable
ALTER TABLE "HelpRequest" ADD COLUMN     "date" TEXT,
ADD COLUMN     "requireEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "time" TEXT;

-- AlterTable
ALTER TABLE "HelpOffer" ADD COLUMN     "email" TEXT;
