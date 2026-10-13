-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "notificationsOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribeToken" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "Person_unsubscribeToken_key" ON "Person"("unsubscribeToken");

