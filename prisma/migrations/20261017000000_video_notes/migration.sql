-- AlterTable
ALTER TABLE "Note" ADD COLUMN "videoId" TEXT;

-- CreateTable
CREATE TABLE "VideoUpload" (
    "publicId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoUpload_pkey" PRIMARY KEY ("publicId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_videoId_key" ON "Note"("videoId");

-- CreateIndex
CREATE INDEX "VideoUpload_personId_createdAt_idx" ON "VideoUpload"("personId", "createdAt");

-- AddForeignKey
ALTER TABLE "VideoUpload" ADD CONSTRAINT "VideoUpload_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A note is written or a video, never both and never neither.
ALTER TABLE "Note" ADD CONSTRAINT "Note_body_or_video" CHECK (("body" <> '') <> ("videoId" IS NOT NULL));
