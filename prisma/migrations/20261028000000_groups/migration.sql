-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('everyone', 'groups');

-- AlterTable
ALTER TABLE "Update" ADD COLUMN     "audience" "Audience" NOT NULL DEFAULT 'everyone';

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","personId")
);

-- CreateTable
CREATE TABLE "UpdateGroup" (
    "updateId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "UpdateGroup_pkey" PRIMARY KEY ("updateId","groupId")
);

-- CreateIndex
CREATE INDEX "Group_familyId_idx" ON "Group"("familyId");

-- CreateIndex
CREATE INDEX "GroupMember_personId_idx" ON "GroupMember"("personId");

-- CreateIndex
CREATE INDEX "UpdateGroup_groupId_idx" ON "UpdateGroup"("groupId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateGroup" ADD CONSTRAINT "UpdateGroup_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateGroup" ADD CONSTRAINT "UpdateGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

