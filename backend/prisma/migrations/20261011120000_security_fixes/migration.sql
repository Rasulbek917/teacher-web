-- Xavfsizlik/bug tuzatishlari:
--   1) User.tokenVersion — parol o'zgarganda eski JWT lar bekor qilinadi
--   2) Payment unique — bir o'quvchi+guruh+oy uchun bitta to'lov yozuvi

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Eski dublikat to'lovlarni tozalash (eng oxirgi yangilangani qoladi)
DELETE FROM "Payment" p
USING "Payment" q
WHERE p."id" <> q."id"
  AND p."studentId" IS NOT NULL AND q."studentId" IS NOT NULL
  AND p."groupId" IS NOT NULL AND q."groupId" IS NOT NULL
  AND p."studentId" = q."studentId"
  AND p."groupId" = q."groupId"
  AND p."periodYear" = q."periodYear"
  AND p."periodMonth" = q."periodMonth"
  AND (
    p."updatedAt" < q."updatedAt"
    OR (p."updatedAt" = q."updatedAt" AND p."id" < q."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "Payment_studentId_groupId_periodYear_periodMonth_key"
  ON "Payment"("studentId", "groupId", "periodYear", "periodMonth");
