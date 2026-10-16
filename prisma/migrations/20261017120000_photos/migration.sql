-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Photo_publicId_key" ON "Photo"("publicId");

-- CreateIndex
CREATE INDEX "Photo_updateId_idx" ON "Photo"("updateId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;
