-- CreateTable
CREATE TABLE "GateAttempt" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateAttempt_familyId_browserId_createdAt_idx" ON "GateAttempt"("familyId", "browserId", "createdAt");

-- CreateIndex
CREATE INDEX "GateAttempt_familyId_network_createdAt_idx" ON "GateAttempt"("familyId", "network", "createdAt");

-- AddForeignKey
ALTER TABLE "GateAttempt" ADD CONSTRAINT "GateAttempt_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
