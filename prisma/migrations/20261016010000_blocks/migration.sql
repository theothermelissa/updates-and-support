-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('text', 'photo');

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "BlockKind" NOT NULL,
    "text" TEXT,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_updateId_position_key" ON "Block"("updateId", "position");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each existing update becomes one text block holding its body. "body" stays, so the code
-- running while this migrates keeps working.
INSERT INTO "Block" ("id", "updateId", "position", "kind", "text")
SELECT gen_random_uuid()::text, "id", 0, 'text'::"BlockKind", "body" FROM "Update";
