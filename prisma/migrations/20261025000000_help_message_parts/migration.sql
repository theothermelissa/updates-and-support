-- The "Do" and "Don't" parts of the family's message on How to help, as checked documents.
ALTER TABLE "Family" ADD COLUMN "helpDo" JSONB;
ALTER TABLE "Family" ADD COLUMN "helpDont" JSONB;
