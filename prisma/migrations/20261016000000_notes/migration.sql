-- CreateEnum
CREATE TYPE "NoteColor" AS ENUM ('sky', 'teal', 'sage', 'oak', 'rose', 'lavender');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "color" "NoteColor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_updateId_createdAt_idx" ON "Note"("updateId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_authorId_createdAt_idx" ON "Note"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A supporter who leaves a note gets a name without an email. Everyone with an email still
-- has a name, and family members always have an email, so they always have a name.
ALTER TABLE "Person" DROP CONSTRAINT "Person_name_with_email";
ALTER TABLE "Person" ADD CONSTRAINT "Person_email_has_name" CHECK ("email" IS NULL OR "name" IS NOT NULL);
