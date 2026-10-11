# Fix Notes — Code Review Follow-up

Har bir band uchun: **nima o'zgardi** va **nega**. Tartib — review'dagi prioritet (A → B → C).

---

## A. Jiddiy muammolar

### 1. `BlockDto` dekoratorsiz edi → bloklash ishlamasdi
`whitelist: true` `isBlocked` ni strip qilib yuborardi, natijada `PATCH /students/:id/block`
hech narsani o'zgartirmasdi.
- `backend/src/students/dto/student.dto.ts`: `SetStudentBlockedDto` ga `@IsBoolean() isBlocked` qo'shildi.
- `students.controller.ts` shu DTO'ni ishlatadi.
- **Audit**: boshqa dekoratorsiz DTO/inline body tekshirildi. Yagona inline body
  `materials.controller.ts` dagi `@Body() body: { url: string }` edi — u ham
  `RemoveImageDto` (`@IsString() url`) ga o'tkazildi. Qolgan barcha body DTO'lar
  `class-validator` dekoratorlariga ega.

### 2. `students.create()` begona loginni egallab olishi
- Endi boshqa o'qituvchining o'quvchisi logini bilan yangi o'quvchi qo'shib bo'lmaydi →
  `BadRequestException("Bu login band")`.
- Faqat o'z o'quvchisini o'zining boshqa guruhiga qo'shishga ruxsat.
- Soxta `reused` qiymati tuzatildi (`{ id, reused }` to'g'ri qaytadi).

### 3. Parol hash'i javobda chiqib ketishi
`students.update()` va `teachers.create()/update()` endi `sanitizeUser()` orqali qaytaradi
(`passwordHash` har doim olib tashlanadi). `common/user.util.ts` dagi `sanitizeUser()`/`userPublicSelect` dan foydalanildi.

### 4. Ruxsatsiz fayl o'chirish (ID bo'yicha)
- **(a)** `chat.sendMessage` endi `fileUrl` ni faqat `UploadedFile` yozuvi `scope=CONVERSATION`,
  `scopeId=conversationId`, `ownerId=userId` bo'lsa qabul qiladi; bo'sh matn **va** bo'sh `fileUrl`
  bo'lsa `BadRequestException`.
- **(b)** `deleteMessage` faqat shunday egalikdagi faylni o'chiradi (`removeConversationFileOwnedBy`).
- **(c)** `materials.removeImage(url)` endi `url ∈ material.imageUrls` ekanini tekshiradi (aks holda 404).
- **(d)** `homework.update()` dagi `keepAttachmentUrls` mavjud `attachmentUrls` bilan kesishadi (intersect).

### 5. `JWT_SECRET` uchun `'dev_secret'` fallback
- Yangi `backend/src/common/env.util.ts`: `jwtSecret()`, `jwtExpiresIn()`, `assertProductionEnv()`.
  `NODE_ENV=production` da sir yo'q yoki <32 belgi bo'lsa **ishga tushishda xato** beradi.
- `auth.module.ts`, `files.module.ts`, `chat.module.ts`: `JwtModule.register` → `registerAsync` + `ConfigService`
  (sir faqat factory vaqtida, `ConfigModule` `.env` ni yuklagach o'qiladi).
- `jwt.strategy.ts`: `secretOrKey: jwtSecret()`.
- **Audit**: modul darajasidagi `process.env` o'qishlar tuzatildi. `login-attempts.service.ts`
  endi `LOGIN_MAX_ATTEMPTS`/`LOGIN_BLOCK_MINUTES` ni konstruktorda o'qiydi. `multer.config.ts` —
  endi faqat `multerOptions(maxMb)` factory.

### 6. `trust proxy` yo'qligi (rate-limit va login-blok)
- `main.ts`: `app.set('trust proxy', 1)`. Endi `@Ip()` haqiqiy mijoz IP'sini (proxy orqasida `X-Forwarded-For`) oladi.
- Natijada: global Throttler endi barcha foydalanuvchini bitta IP'ga jamlamaydi; login blok kaliti
  `${ip}:${login}` bo'lib, bir foydalanuvchi boshqasining loginini bloklay olmaydi.

### 7. Bildirishnoma havolalari 404 berishi
Backend frontendda mavjud bo'lmagan yo'llarga havola yuborardi. Frontend routelariga moslashtirildi:
- `homework.service.ts`: `/teacher/homework/:id` → `/homework`
- `submissions.service.ts`: `/student/homework/:id` → `/my-homework`
- `lesson-reminder.service.ts`: `/teacher/groups` → `/groups`, `/student/home` → `/`

### 8. `students.remove()` boshqa o'qituvchi ma'lumotlariga ta'siri
- Endi faqat **shu o'qituvchi guruhlaridagi** topshiriq javoblari (DB yozuvi + fayl) o'chiriladi.
- To'lovlar (`Payment`) o'zgartirilmaydi. Akkaunt butunlay bo'shaganda (`remaining === 0`) o'chiriladi
  va ochiq socket uziladi.

---

## B. O'rta darajali

### 9. `useStaticAssets` va Multer kengaytmasi
- `main.ts`: `useStaticAssets` olib tashlandi (fayllar faqat avtorizatsiyalangan `/api/files/:id` orqali).
- `multer.config.ts`: kengaytma endi `originalname` dan emas, **ruxsat etilgan MIME** dan olinadi
  (`.html` kabi xavfli kengaytmalar oldini oladi).

### 10. `SUBMISSION` fayllari boshqa o'quvchilarga ko'rinishi
`files.service.ts authorize()`: `SUBMISSION` uchun faqat **fayl egasi** yoki **guruh o'qituvchisi** ruxsat oladi;
guruhdagi boshqa o'quvchilar olmaydi. `GROUP` (material/biriktirma) qoidasi o'zgarmadi.

### 11. URL'dagi JWT (history/Referer/Caddy loglarga tushishi)
- Endi `?token=<JWT>` ishlatilmaydi. Login/register'da HttpOnly cookie `et_ftoken`
  (`SameSite=Lax`, `path=/api/files`, production'da `Secure`) o'rnatiladi; `/auth/me` har ochilishda yangilaydi;
  `/auth/logout` uni tozalaydi.
- `files.controller.ts` cookie'ni o'qiydi. Frontend `api.ts`: `withCredentials: true`, `fileUrl()` endi tokensiz URL qaytaradi.
- `<img>/<video>` ham cookie orqali ishlaydi.

### 12. To'lov dublikatlari
- `schema.prisma`: `Payment @@unique([studentId, groupId, periodYear, periodMonth])`.
- `payments.markPaid()` endi `upsert` ishlatadi (bir o'quvchi+guruh+oy uchun bitta yozuv).
- Migratsiya `20261011120000_security_fixes`: mavjud dublikatlar (eng oxirgi `updatedAt`, teng bo'lsa katta `id`) tozalanib, unique index qo'shildi.

### 13. `payments.studentPayments()` oynasi
- Ilgari `joinedAt` dan 24 oy sanalardi va 24 oydan oldin qo'shilganlar uchun joriy oylar tushib qolardi.
- Endi boshlanish = `max(joinedAt, joriy oy − 23)`, ya'ni joriy oy **doim** qo'shiladi.

### 14. Statistika hisob-kitobi
- Muddat qo'yilmagan uy vazifalari tashlab ketilardi: endi filtr `dueAt` oralig'i **yoki**
  (`dueAt == null` va `createdAt` oralig'i).
- `submissionPct` maxraji endi `homeworks × students` (100% dan oshmaydi).

### 15. `submissions.review()/bulkReview()`
- `undefined` maydon yuborilganda mavjud `grade`/`comment` saqlanadi (faqat aniq `null` tozalaydi).
- `bulkReview()` endi `$transaction` da bajariladi (atomik) va har bir o'quvchiga bildirishnoma yuboradi.
- `BulkReviewDto.reviews` uchun `@ArrayMaxSize(200)`. Foydasiz bo'sh `groupChecks` kodi olib tashlandi.

### 16. `students.update()` `memberships: []`
`memberships` uchun `@ArrayMinSize(1)` — o'quvchi barcha guruhlardan bir yo'la chiqib qolmaydi.

### 17. Global bloklash
Blok butun akkauntga ta'sir qiladi. Agar o'quvchi boshqa o'qituvchi guruhida ham bo'lsa,
javob `{ id, isBlocked, affectsOtherTeachers, warning }` qaytaradi va frontend ogohlantirishni toast ko'rsatadi.
Bloklanganda ochiq socket darhol uziladi (`disconnectUser`).

### 18. Chat yuklash tartibi va limiti, guruh o'chirilishi
- `chat.controller.upload()` endi faylni saqlashdan **oldin** `assertParticipant` tekshiradi;
  xatolikda yuklangan fayl o'chiriladi (`discard`).
- `multerOptions(maxMb)` factory + `uploadMaxMb` — har bir tur uchun alohida limit.
- `groups.remove()` endi guruh chat fayllarini (scope `CONVERSATION`) ham diskdan o'chiradi.

### 19. `realtime.gateway.ts`
- WS `message:send/edit/delete` handlerlari olib tashlandi (frontend REST ishlatadi, faqat qabul qiladi).
- CORS `origin: true` o'rniga `CORS_ORIGIN` allowlisti.
- `tokenVersion` tekshiriladi; blok/akkaunt o'chirilganda socket uziladi (`disconnectUser`).

### 20. Validatsiyasiz query parametrlari (500)
Har bir endpoint uchun `class-validator` query DTO qo'shildi (whitelist DTO maydonlarini strip qilmasligi uchun):
- attendance (`AttendanceQueryDto`), statistics, payments (`PaymentsQueryDto`),
  dashboard (`DashboardQueryDto`), submissions `studentHomeworks` (`StudentHomeworksQueryDto`),
  chat `getMessages` (`ChatMessagesQueryDto` — `limit` NaN/bad `before`), homework (`HomeworkQueryDto`),
  materials (`MaterialsQueryDto` — `type` endi `@IsEnum(MaterialType)`).
- Umumiy `PaginationQueryDto` (`common/dto/pagination-query.dto.ts`).

**Qo'shimcha:** `@IsOptional()` faqat `null`/`undefined` ni o'tkazib yuboradi — bo'sh satr (`?type=`) esa
format validatsiyasidan o'tolmay 400 berardi. Frontend "Barchasi" filtri `type=` yuborardi, shu sababli
o'qituvchi **Materiallar** sahifasi "Xatolik yuz berdi" ko'rsatgan.
- Yangi `common/app-validation.pipe.ts` (`AppValidationPipe`) — query'dagi bo'sh satrlarni
  validatsiyadan oldin olib tashlaydi (barcha endpointlar uchun; query'da bo'sh qiymat = "berilmagan").
- Frontend `MaterialsPage.tsx`: tur "Barchasi" bo'lganda `type` parametri umuman yuborilmaydi
  (`type || undefined`).
- Noto'g'ri qiymat (`type=BOGUS`) baribir 400 qaytaradi.

### 21. Kichik DTO/logika xatolari
- `payment.dto.ts`: `paidAt` `@IsString()` → `@IsDateString()`; "bolishi" → "bo'lishi".
- `student.dto.ts`: matn xatosi tuzatildi.
- `homework.submit()`: bo'sh javob → `BadRequestException`.
- Qayta topshirishda bo'sh matn eski matnni o'chirib yuborolmaydi.

### 22. Parol o'zgargach eski JWT 7 kun amal qilishi
- `User.tokenVersion Int @default(0)` qo'shildi.
- Parol o'zgarganda (o'quvchi, o'qituvchi, o'z profili) `tokenVersion` oshiriladi.
- `JwtStrategy.validate` payload'dagi `tv` bilan solishtiradi; mos kelmasa token rad etiladi
  (eski, `tv`siz tokenlar 0 deb qaraladi).

---

## C. Deploy/Config

### 23. `.gitignore` va sirlar
- `.gitignore` qo'shildi: `node_modules`, `dist`, `uploads`, `.env*` (`.env.example` dan tashqari) va h.k.
- `.env.example` qo'shildi (namuna qiymatlar, real sirsiz).
- Production'da zaif/`dev_secret` JWT bilan ishga tushishga yo'l qo'yilmaydi (5-band).

### 24. `docker-compose.yml` va seed himoyasi
- Dev stack'da Postgres `127.0.0.1:5432` va backend `127.0.0.1:3000` ga bog'landi (tashqi tarmoqqa chiqmaydi).
- `prisma/seed.ts`: `NODE_ENV=production` da `SUPERADMIN_PASSWORD` yo'q yoki `'superadmin123'` bo'lsa ishga tushmaydi.

---

## O'zgargan fayllar

### Backend — baza/sxema
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261011120000_security_fixes/migration.sql`
- `backend/prisma/seed.ts`

### Backend — umumiy
- `backend/src/common/env.util.ts` **(yangi)**
- `backend/src/common/dto/pagination-query.dto.ts` **(yangi)**
- `backend/src/common/app-validation.pipe.ts` **(yangi)**
- `backend/src/main.ts`

### Backend — auth
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/jwt.strategy.ts`
- `backend/src/auth/login-attempts.service.ts`

### Backend — files/chat
- `backend/src/files/files.module.ts`
- `backend/src/files/files.service.ts`
- `backend/src/files/files.controller.ts`
- `backend/src/files/multer.config.ts`
- `backend/src/chat/chat.module.ts`
- `backend/src/chat/chat.controller.ts`
- `backend/src/chat/chat.service.ts`
- `backend/src/chat/realtime.gateway.ts`
- `backend/src/chat/dto/chat.dto.ts`

### Backend — o'quvchi/o'qituvchi/foydalanuvchi/guruh
- `backend/src/students/students.controller.ts`
- `backend/src/students/students.service.ts`
- `backend/src/students/students.module.ts`
- `backend/src/students/dto/student.dto.ts`
- `backend/src/teachers/teachers.service.ts`
- `backend/src/users/users.service.ts`
- `backend/src/users/users.controller.ts`
- `backend/src/groups/groups.service.ts`

### Backend — material/vazifa/topshiriq
- `backend/src/materials/materials.controller.ts`
- `backend/src/materials/materials.service.ts`
- `backend/src/materials/dto/material.dto.ts`
- `backend/src/homework/homework.controller.ts`
- `backend/src/homework/homework.service.ts`
- `backend/src/homework/dto/homework.dto.ts`
- `backend/src/submissions/submissions.controller.ts`
- `backend/src/submissions/submissions.service.ts`
- `backend/src/submissions/dto/submissions.dto.ts` **(yangi)**

### Backend — to'lov/statistika/dashboard/davomat/bildirishnoma
- `backend/src/payments/payments.controller.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/payments/dto/payment.dto.ts`
- `backend/src/statistics/statistics.controller.ts`
- `backend/src/statistics/statistics.service.ts`
- `backend/src/statistics/dto/statistics.dto.ts`
- `backend/src/dashboard/dashboard.controller.ts`
- `backend/src/dashboard/dto/dashboard.dto.ts`
- `backend/src/attendance/attendance.controller.ts`
- `backend/src/attendance/dto/attendance.dto.ts`
- `backend/src/notifications/lesson-reminder.service.ts`

### Backend — testlar
- `backend/smoke.mjs` (1, 2, 4, 6, 7, 11, 12, 13 bandlar uchun tekshiruvlar)

### Frontend
- `frontend/src/lib/api.ts` (tokensiz `fileUrl`, `withCredentials`)
- `frontend/src/context/AuthContext.tsx` (`/auth/logout` chaqiruvi)
- `frontend/src/pages/teacher/StudentsPage.tsx` (blok ogohlantirishi)
- `frontend/src/pages/teacher/MaterialsPage.tsx` (bo'sh `type` yuborilmaydi)

### Root
- `docker-compose.yml`
- `.gitignore` **(yangi)**
- `.env.example` **(yangi)**

---

## Tekshiruv natijalari

- Backend `npm run build` — muvaffaqiyatli.
- Frontend `npm run build` — muvaffaqiyatli.
- `npm run test:e2e` — 15/15.
- `node smoke.mjs` — **54/54 PASS** (yangi tekshiruvlar: blok validatsiyasi,
  login qayta ishlatilmasligi, chat/biriktirma egaligi, `X-Forwarded-For`,
  bildirishnoma havolasi, to'lov upsert, joriy oy to'lovi, HttpOnly cookie).
- Qo'shimcha tuzatish (bo'sh query `type=`) alohida tekshirildi: `GET /api/materials`
  `type=` bilan **200**, `type=BOGUS` bilan **400**. `smoke.mjs` ga ham regressiya
  tekshiruvi qo'shildi (endi 55 tekshiruv).

---

## Vercel + VPS (ikkala muhit) moslashtirish

Maqsad: **bir xil kod** VPS'da ham, Vercel'da ham ishlashi. Barcha yangi
xulq-atvor env o'zgaruvchilari orqali boshqariladi va env berilmagan holatda
VPS xatti-harakati **o'zgarmaydi**.

### Yangi fayllar
- `vercel.json` — servislar (`backend`, `frontend`) + rewrite'lar.
- `backend/src/files/blob.storage.ts` — Vercel Blob drayveri.
- `backend/src/notifications/lesson-reminder.controller.ts` — `POST /api/cron/lesson-reminders`.

### O'zgartirilgan fayllar
- `frontend/src/lib/api.ts` — `VITE_API_URL` bo'lmasa production'da same-origin (`/api`).
- `frontend/src/context/SocketContext.tsx` — `API_URL || window.location.origin`.
- `backend/src/files/files.service.ts` — Blob yoki disk (env bo'yicha).
- `backend/src/files/multer.config.ts` — Blob'da `memoryStorage`, aks holda `diskStorage`.
- `backend/src/files/files.controller.ts` — Blob URL'ni avtorizatsiyadan keyin stream qiladi.
- `backend/src/chat/realtime.gateway.ts` — `REDIS_URL` bo'lsa Redis adapter (ko'p instance).
- `backend/docker-entrypoint.sh` — `RUN_MIGRATIONS_ON_START` (standart `true`).
- `backend/src/notifications/notifications.module.ts` — yangi controller.
- `backend/package.json` — `@vercel/blob`, `@socket.io/redis-adapter`, `redis`.
- `.env.example`, `README.md` — hujjat.

### Xatti-harakat
- `BLOB_READ_WRITE_TOKEN` yo'q -> fayllar diskda (VPS, avvalgidek).
- `BLOB_READ_WRITE_TOKEN` bor -> fayllar Vercel Blob'da (private, avtorizatsiyalangan stream).
- `REDIS_URL` yo'q -> xotiradagi Socket.IO adapter (VPS).
- `REDIS_URL` bor -> Redis adapter (Vercel / ko'p konteyner).
- `RUN_MIGRATIONS_ON_START=false` -> startda migratsiya/seed o'tkazib yuboriladi (Vercel).

### Tekshiruv
- Backend `npm run build` — muvaffaqiyatli.
- Frontend `npm run build` — muvaffaqiyatli.
- `node smoke.mjs` — **55/55 PASS** (VPS/disk rejimida).

### Bilib turish kerak
- Vercel Functions body limiti **4.5 MB** — katta video Vercel'da yuklanmaydi (VPS kerak).
- Vercel Cron Hobby'da kuniga 1 marta; har daqiqa uchun Pro lozim.
