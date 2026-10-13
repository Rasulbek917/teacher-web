-- O'qituvchi uchun Telegram ulanish maydonlari (bot orqali oylik tushum,
-- davomat va dars eslatmalari).
-- FAQAT QO'SHADI (ADD COLUMN / CREATE INDEX) — mavjud ma'lumotlar
-- (o'quvchilar, o'qituvchilar, to'lovlar) o'chmaydi yoki o'zgarmaydi.

-- AlterTable
ALTER TABLE "TeacherProfile" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkToken" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_telegramLinkToken_key" ON "TeacherProfile"("telegramLinkToken");
