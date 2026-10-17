-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "allowNotesByDefault" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Update" ADD COLUMN     "allowNotes" BOOLEAN NOT NULL DEFAULT true;
