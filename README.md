# Teacher Web — Django

O'quv markazi boshqaruv platformasi. Ilova Django 5 server-rendered sahifalari, PostgreSQL va Caddy bilan ishlaydi. Frontend va backend bitta Django ilovasiga birlashtirilgan.

## Imkoniyatlar

- **Rollar:** Super Admin, o'qituvchi va o'quvchi; serverda ruxsat tekshiruvi, login urinishlarini cheklash.
- **O'qituvchi:** guruhlar, o'quvchilar, materiallar, uy vazifalari, topshiriqlarni baholash, davomat, baholar, statistika, to'lovlar va muddatlar.
- **O'quvchi:** guruh, uy vazifalari va javob topshirish, materiallar, baholar, davomat, statistika va to'lovlar.
- **Chat va bildirishnomalar:** guruh/shaxsiy chat, o'qilganlik holati, tizim ichidagi eslatmalar.
- **UstozAI testlari:** qo'lda yoki Gemini yordamida test yaratish, PDF/DOCX matnidan savol tuzish, nashr va ulashish havolasi, urinishlar, vaqt limiti, aralashtirilgan savollar/javoblar, natija va savollar tahlili.
- **AI yordamchi:** suhbat orqali TeacherWeb bo'yicha savol-javob, guruh/test natijalarini tahlil qilish, uy vazifasi tuzish va guruhga berish, o'quvchi topshirig'iga baho qo'yish. Baho va yangi vazifa saqlanishidan oldin o'qituvchi tasdiqlaydi. Dars rejasi, tushuntirish, kartochka, konspekt va ish varaqalari ham yaratiladi.
- **Telegram:** ota-ona/akkauntni bir martalik token bilan ulash, test va natijalar buyruqlari, davomat va to'lov xabarlari.
- **Interfeys:** o'zbekcha, mobilga mos, yorug'/qorong'i mavzu; Asia/Tashkent vaqt zonasi.

## Mahalliy ishga tushirish

Talablar: Python 3.12+, PostgreSQL (yoki SQLite uchun `DATABASE_URL`ni olib tashlash).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Sayt: <http://127.0.0.1:8000/>. Demo login/parollar `seed_demo` management command orqali yaratiladi:

- Super Admin: `.env`dagi `SUPERADMIN_LOGIN` va `SUPERADMIN_PASSWORD`
- O'qituvchi: `oqituvchi` / `teacher123`
- O'quvchi: `student1` / `student123`

Demo foydalanuvchilarni haqiqiy serverda ishlatmang; birinchi ishga tushirishdan oldin `.env`dagi parol va `DJANGO_SECRET_KEY`ni almashtiring.

## Docker

```bash
cp .env.example .env
# .env da PostgreSQL paroli, Django secret, domen va kerakli API kalitlarni sozlang
docker compose up -d --build
```

Lokal manzil: <http://127.0.0.1:8000/>. Fayllar `uploads` volume'ida, statik fayllar `staticfiles` volume'ida saqlanadi.

Production uchun DNS domenni serverga yo'naltirib, `.env`ni to'ldiring:

```env
DOMAIN=teacher.example.uz
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=teacher.example.uz
DJANGO_CSRF_TRUSTED_ORIGINS=https://teacher.example.uz
DJANGO_SECRET_KEY=<uzun-tasodifiy-kalit>
DJANGO_SECURE_COOKIES=1
POSTGRES_PASSWORD=<kuchli-parol>
```

So'ng:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy HTTPS sertifikatini avtomatik oladi. Migratsiya va `collectstatic` konteyner startida bajariladi. Yangi production bazada birinchi administratorni yarating:

```bash
docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

## UstozAI sozlamalari

`.env`da quyidagilar ixtiyoriy. Kalit bo'lmasa oddiy sayt ishlashda davom etadi; AI sahifalari tushunarli xabar ko'rsatadi.

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
AI_MAX_INPUT_CHARS=30000
AI_MAX_OUTPUT_TOKENS=8192
TEST_MAX_FILE_MB=10
```

## Telegram sozlamalari

`.env`da BotFather tokeni va bot username'ini kiriting. Django webhook yo'li `/telegram/webhook/`; Telegram webhook'ni shu yo'lga va `TELEGRAM_WEBHOOK_SECRET`ni maxfiy sarlavhaga moslab sozlang. Dars va to'lov eslatmalari uchun GitHub Actions `CRON_SECRET` va `https://<domen>/cron/reminders/` endpointini har 5 daqiqada chaqiradi.

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
```

## Buyruqlar

```bash
python manage.py check
python manage.py migrate
python manage.py makemigrations
python manage.py seed_demo
python manage.py collectstatic --noinput
```

## Eski Prisma bazasidan ma'lumot importi

Import eski PostgreSQL bazasini faqat o'qiydi. Avval ulanishni `.env`ga `LEGACY_DATABASE_URL` qilib yozing yoki buyruqqa `--source-url` uzating. Dastlab faqat jadval sonlarini ko'ring:

```bash
python manage.py import_legacy_db
```

Importni faqat bo'sh Django bazasiga bajaring:

```bash
python manage.py migrate
python manage.py import_legacy_db --execute
```

Eski parol xeshlari bcrypt bo'lsa, foydalanuvchi birinchi muvaffaqiyatli kirganida Django xeshiga yangilanadi. Eski media serverdagi fayllar ko'chmaydi; import ularning saqlangan URL/path ma'lumotlarini saqlaydi. Eski fayl serveri manzillari ishlashda qolishi yoki fayllarni alohida `MEDIA_ROOT`ga nusxalab moslash kerak. Buyruq eski bazaga yozmaydi va importdan oldin maqsad bazaning bo'shligini talab qiladi.

Asosiy loyiha Django/Python'da ishlaydi; frontend uchun Node/Next/TypeScript build talab qilinmaydi.
