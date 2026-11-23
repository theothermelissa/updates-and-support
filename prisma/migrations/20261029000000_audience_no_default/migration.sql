-- Every create names the audience; old code always sent it from slice 1 on.
ALTER TABLE "Update" ALTER COLUMN "audience" DROP DEFAULT;
