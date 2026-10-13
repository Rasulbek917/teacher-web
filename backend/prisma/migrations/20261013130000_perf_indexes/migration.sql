-- Ism bo'yicha tartiblash/izlash uchun qo'shimcha indekslar (faqat qo'shish).
-- Ma'lumot o'zgarmaydi: faqat indeks yaratiladi.
CREATE INDEX IF NOT EXISTS "User_firstName_lastName_idx" ON "User"("firstName", "lastName");
CREATE INDEX IF NOT EXISTS "User_role_firstName_idx" ON "User"("role", "firstName");
