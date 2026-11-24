-- CreateTable
CREATE TABLE "InviteRequest" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT,
    "network" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteRequest_familyId_createdAt_idx" ON "InviteRequest"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "InviteRequest_familyId_network_createdAt_idx" ON "InviteRequest"("familyId", "network", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InviteRequest_familyId_email_key" ON "InviteRequest"("familyId", "email");

-- AddForeignKey
ALTER TABLE "InviteRequest" ADD CONSTRAINT "InviteRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
