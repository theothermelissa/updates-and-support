-- AlterTable
ALTER TABLE "Update" ADD COLUMN "videoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Update_videoId_key" ON "Update"("videoId");

-- A video update has no document. Its body is the wall's stand-in. A text update has no video.
ALTER TABLE "Update" ADD CONSTRAINT "Update_text_or_video" CHECK (
  ("videoId" IS NULL) OR ("content" IS NULL AND "body" = '[Video]')
);
