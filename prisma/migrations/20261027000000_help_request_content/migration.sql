-- A request's description as a formatted document; body keeps its plain text.
ALTER TABLE "HelpRequest" ADD COLUMN "content" JSONB;
