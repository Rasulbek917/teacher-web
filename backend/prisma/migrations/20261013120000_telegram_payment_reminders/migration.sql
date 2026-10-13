-- Ota-onaga Telegram bildirishnomalari + oylik to'lov muddati.
-- FAQAT QO'SHADI (ADD COLUMN / CREATE TABLE / CREATE INDEX) — mavjud
-- ma'lumotlar (o'quvchilar, o'qituvchilar, to'lovlar) o'chmaydi.

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "parentTelegramChatId" TEXT,
ADD COLUMN     "telegramLinkToken" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentDeadline" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNotificationLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "periodYear" INTEGER,
    "periodMonth" INTEGER,
    "offsetDays" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentDeadline_dueDate_idx" ON "PaymentDeadline"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentDeadline_teacherId_periodYear_periodMonth_key" ON "PaymentDeadline"("teacherId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ParentNotificationLog_dedupeKey_key" ON "ParentNotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "ParentNotificationLog_studentId_idx" ON "ParentNotificationLog"("studentId");

-- CreateIndex
CREATE INDEX "ParentNotificationLog_kind_sentAt_idx" ON "ParentNotificationLog"("kind", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_telegramLinkToken_key" ON "StudentProfile"("telegramLinkToken");

-- AddForeignKey
ALTER TABLE "PaymentDeadline" ADD CONSTRAINT "PaymentDeadline_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
