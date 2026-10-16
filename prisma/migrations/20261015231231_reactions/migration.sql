-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('heart', 'pray', 'hug', 'strong', 'party', 'laugh');

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_updateId_personId_kind_key" ON "Reaction"("updateId", "personId", "kind");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
