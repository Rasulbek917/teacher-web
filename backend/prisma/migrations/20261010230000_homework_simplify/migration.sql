-- Homework: optional deadline + multiple optional attachments
ALTER TABLE "Homework" ALTER COLUMN "dueAt" DROP NOT NULL;

ALTER TABLE "Homework" ADD COLUMN "attachmentUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate the legacy single attachment into the new array
UPDATE "Homework"
SET "attachmentUrls" = ARRAY["attachmentUrl"]
WHERE "attachmentUrl" IS NOT NULL;

ALTER TABLE "Homework" DROP COLUMN "attachmentUrl";
