-- CreateEnum
CREATE TYPE "LinkPurpose" AS ENUM ('sign_in', 'verify');

-- AlterTable
ALTER TABLE "MagicLink" ADD COLUMN     "purpose" "LinkPurpose" NOT NULL DEFAULT 'sign_in';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);
