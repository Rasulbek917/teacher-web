# Teacher Web — O'quv markazi boshqaruv platformasi

Zamonaviy ta'lim (EdTech) SaaS platformasi: o'qituvchilar va o'quvchilarni
boshqarish, davomat, baholar, uy vazifalari, to'lovlar, statistika,
real vaqtdagi chat va bildirishnomalar — premium, minimal va to'liq
moslashuvchan (mobil-first) interfeysda.

- **Backend:** NestJS + Prisma + PostgreSQL + Socket.IO
- **Frontend:** React + Vite + Tailwind CSS (mobil-first, UZ/EN, light/dark)
- **Deploy:** Docker Compose + Caddy (avtomatik HTTPS va WebSocket)

---

## Rollar

| Rol | Imkoniyatlar |
|-----|--------------|
| **Super Admin** | Barcha o'qituvchilarni ko'rish/yaratish/tahrirlash/o'chirish, umumiy statistika |
| **Teacher** | O'z guruhlari, o'quvchilari, darslari, uy vazifalari, davomat+baholar, statistika, to'lovlar, chat, sozlamalar |
| **Student** | Guruhi va jadvali, uy vazifalari (topshirish), baholari, video/rasm materiallar, davomat statistikasi, to'lov holati, chat |

Ruxsatlar **backendda** tekshiriladi: o'qituvchi faqat o'z guruhlarini,
o'quvchi faqat o'z ma'lumotlarini ko'radi.

---

## Asosiy xususiyatlar

- Login (5 marta xato → 5 daqiqa blok), faqat o'qituvchi ro'yxatdan o'ta oladi.
- Har bir ro'yxatda qidiruv / filtr / paginatsiya; har sahifada loading / empty /
  error(retry) / success holatlari; har amalda toast; o'chirishdan oldin tasdiq.
- Davomat (bir o'quvchi + guruh + sana uchun takrorlanmaydi), baholar.
- Uy vazifasi: matn/fayl topshirish; o'qituvchi baholashi 0–100 (izoh ixtiyoriy),
  tezkor baholash rejimi, darsda "qabul qilindi" belgisi; muddat va biriktirmalar ixtiyoriy.
- To'lovlar: oylik, qisman/to'langan; o'quvchi o'chirilsa to'lov yozuvi saqlanadi.
- Statistika: haftalik/oylik davomat, uy vazifalari, o'rtacha baho.
- Chat: guruh va shaxsiy suhbatlar; matn, rasm, fayl, video, ovozli xabar;
  tahrirlash/o'chirish; o'qilganlik belgilari.
- Bildirishnomalar: har daqiqada tekshiriladigan cron, takroriy xabar yubormaslik
  (dedupe) kafolati.
- Vaqt zonasi **Asia/Tashkent**; sana `kun.oy.yil` (10.10.2026); vaqt 24 soat;
  pul `300 000 so'm`.

---

## Repozitoriya tuzilishi

```
.
├─ backend/                # NestJS API
│  ├─ prisma/              # schema, migrations, seed
│  ├─ src/                 # modullar (auth, groups, students, ...)
│  ├─ test/                # e2e testlar (jest + supertest)
│  ├─ Dockerfile
│  └─ docker-entrypoint.sh # migrate + seed + start
├─ frontend/               # React (Vite)
│  ├─ src/                 # pages, components, context, i18n, lib
│  ├─ Dockerfile
│  └─ nginx.conf
├─ docker-compose.yml      # lokal (dev) stack
├─ docker-compose.prod.yml # production stack (+ Caddy HTTPS)
├─ Caddyfile               # reverse proxy (HTTPS + WebSocket)
└─ .env.example            # production env namunasi
```

---

## 1. Lokal ishga tushirish (development)

Talab: Node.js 20+, npm, Docker.

```bash
# 1) Bazani ko'tarish (PostgreSQL, port 5432)
docker compose up -d postgres

# 2) Backend
cd backend
cp .env.example .env 2>/dev/null || true   # yo'q bo'lsa quyidagi .env ni yarating
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev        # http://localhost:3000/api

# 3) Frontend (yangi terminal)
cd frontend
npm install
npm run dev              # http://localhost:5173
```

`backend/.env` (lokal) namunasi:

```env
DATABASE_URL=postgresql://et_user:et_password@localhost:5432/english_teachers?schema=public
JWT_SECRET=dev_secret_change_me_please_32_chars_min
JWT_EXPIRES_IN=7d
SUPERADMIN_LOGIN=superadmin
SUPERADMIN_PASSWORD=superadmin123
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads

# --- Telegram bot (ota-onaga bildirishnoma) ---
# Token bo'lmasa xabar yuborilmaydi (sayt baribir ishlaydi).
TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token
TELEGRAM_BOT_USERNAME=YourBot
# Webhook'ni himoyalash uchun maxfiy so'z (ixtiyoriy, tavsiya etiladi):
TELEGRAM_WEBHOOK_SECRET=change-me
# Ommaviy HTTPS manzil (bo'sh bo'lsa CORS_ORIGIN'dan olinadi):
TELEGRAM_WEBHOOK_URL=https://your-domain.uz/api/telegram/webhook
# /cron/* endpointlarini himoyalash (ixtiyoriy):
CRON_SECRET=change-me
```

> **Bildirishnomalar.** O'qituvchi o'quvchi kartasidagi Telegram tugmasi orqali
> ota-onaga havola (`t.me/<bot>?start=<token>`) yuboradi; ota-ona botda «Start»
> bosgach ulanadi. So'ng: (a) o'quvchi darsga **kelmadi** belgilansa darhol xabar
> boradi; (b) oylik to'lov muddatidan 1 hafta oldin, muddat kuni va keyin
> **har 2 kunda** to'lamaguncha eslatma boradi (faqat UNPAID/PARTIAL). Muddat har
> oy uchun «To'lovlar» sahifasida qo'lda tanlanadi.
>
> **Vercel'da** doimiy cron ishlamaydi — `/api/cron/payment-reminders` ni tashqi
> scheduler (yoki Vercel Cron) orqali kuniga bir marta chaqiring:
> `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domen>/api/cron/payment-reminders`.

`frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

### Testlar

```bash
cd backend
npm run test:e2e     # 15 ta e2e test (login/ruxsat, davomat, to'lov, kaskad, dedupe ...)

# Ishlab turgan backendga qarshi to'liq API smoke test (77 ta tekshiruv):
node smoke.mjs

# Demo ma'lumotlar yaratish (teacher1/teacher123, student1/student123):
node dev-seed.mjs
```

Testlar haqiqiy PostgreSQL bazasiga ulanadi (`backend/.env` → `DATABASE_URL`).

### Lokal Docker stack (postgres + backend + frontend)

```bash
cp .env.example .env        # qiymatlarni lokal uchun moslashtiring
docker compose up -d --build
# frontend: http://localhost:5173
# backend:  http://localhost:3000/api
```

---

## 2. Production deploy (Ubuntu + Docker + domen)

### 2.1. Serverga Docker o'rnatish

```bash
sudo apt update
sudo apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # qayta login qiling
docker --version && docker compose version
```

### 2.2. Loyihani joylashtirish

```bash
sudo mkdir -p /opt/teacher-web && cd /opt/teacher-web
# kodni git orqali klonlang yoki yuklang
git clone <REPO_URL> .
```

### 2.3. Domen va env

- Domen DNS `A` yozuvini server IP manziliga yo'naltiring (`A @  <SERVER_IP>`).
- Portlar `80` va `443` ochiq bo'lishi kerak.

```bash
cp .env.example .env
nano .env
```

Muhim qiymatlar:

- `DOMAIN` — masalan `english.example.com`
- `POSTGRES_PASSWORD` — kuchli parol
- `JWT_SECRET` — `openssl rand -hex 32`
- `SUPERADMIN_PASSWORD` — kuchli parol
- `CORS_ORIGIN=https://<DOMAIN>`
- `VITE_API_URL=https://<DOMAIN>`

### 2.4. Ishga tushirish

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend
```

Caddy HTTPS sertifikatini avtomatik oladi. Ilova: `https://<DOMAIN>`.

### 2.5. Yangilash (update)

```bash
cd /opt/teacher-web
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```

Migratsiyalar backend konteyneri ishga tushganda avtomatik qo'llaniladi
(`docker-entrypoint.sh` → `prisma migrate deploy`).

---

## 3. Zaxira nusxa (Backup) va tiklash (Restore)

### 3.1. Baza zaxirasi

```bash
# Zaxira olish (gzip)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup_$(date +%F_%H%M).sql.gz
```

### 3.2. Bazani tiklash

```bash
gunzip -c backup_2026-10-10_1200.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### 3.3. Yuklangan fayllar (videolar, avatarlar, hujjatlar)

Fayllar `uploads` Docker volume'ida saqlanadi:

```bash
# Zaxira
docker run --rm -v defaultproject_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz -C /data .

# Tiklash
docker run --rm -v defaultproject_uploads:/data -v "$PWD":/backup alpine \
  tar xzf /backup/uploads_2026-10-10.tar.gz -C /data
```

> Volume nomi compose loyiha nomiga bog'liq. Aniq nomni `docker volume ls` bilan
> tekshiring.

---

## 4. Super Admin parolini tiklash

1. `.env` faylida:

```env
SUPERADMIN_LOGIN=superadmin
SUPERADMIN_PASSWORD=YANGI_KUCHLI_PAROL
SUPERADMIN_RESET_PASSWORD=true
```

2. Backendni qayta ishga tushiring (seed ishga tushadi):

```bash
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml logs backend | grep -i "Super Admin"
```

3. Keyin `.env` da `SUPERADMIN_RESET_PASSWORD=false` qilib qo'ying.

---

## 5. Foydali buyruqlar

```bash
# Konteynerlar holati
docker compose -f docker-compose.prod.yml ps

# Backend loglari
docker compose -f docker-compose.prod.yml logs -f backend

# Caddy loglari (HTTPS/WebSocket)
docker compose -f docker-compose.prod.yml logs -f caddy

# To'xtatish
docker compose -f docker-compose.prod.yml down

# Ma'lumotlar bilan birga to'xtatish (EHTIYOT BO'LING)
docker compose -f docker-compose.prod.yml down -v
```

---

## 6. Vercel'ga deploy (ixtiyoriy — VPS bilan bir xil kod)

Bir xil repodan ikkala muhitga deploy qilinadi. Ildizdagi `vercel.json`
**Vercel Services** rejimida ikki servisni e'lon qiladi:

- `backend` — NestJS, **container** (`backend/Dockerfile.vercel`) — Prisma,
  Socket.IO va barcha tizim kutubxonalari image ichida bo'ladi;
- `frontend` — Vite (statik SPA, `index.html` fallback).

Rewrite'lar: `/api/*` va `/socket.io/*` → `backend`; qolgani → `frontend`.
Shu sababli ikkalasi ham **bitta domenda** (same-origin) ishlaydi — CORS muammosi yo'q.

> Vercel loyiha sozlamalari: **Root Directory** = repo ildizi, **Framework** = `services`.

### Deploy qadamlari (Vercel CLI)

```bash
npx vercel login                              # 1) kirish
npx vercel link --project teacher-web         # 2) loyihani ulash (repo ildizida)
npx vercel blob create-store teacher-web-blob --access private --yes   # 3) fayl store + token
echo "postgresql://..." | npx vercel env add DATABASE_URL production   # 4) env
npx vercel deploy --prod                      # 5) deploy
```

### Kerakli Vercel env o'zgaruvchilari

| O'zgaruvchi | Qiymat |
| --- | --- |
| `DATABASE_URL` | Neon (yoki boshqa) Postgres, `?sslmode=require` bilan |
| `JWT_SECRET` | kuchli, tasodifiy sir (≥32 belgi) |
| `SUPERADMIN_*` | superadmin login/parol/ism... (`SUPERADMIN_PASSWORD` kuchli) |
| `CORS_ORIGIN` | `https://teacher.<domen>.uz` |
| `NODE_ENV` | `production` |
| `BLOB_READ_WRITE_TOKEN` | `blob create-store` bilan avtomatik qo'shiladi |
| `BLOB_ACCESS` | `private` |
| `RUN_MIGRATIONS_ON_START` | `false` (baza migratsiyasi qo'lda bir marta) |
| `REDIS_URL` | Upstash Redis (ko'p instance chat uchun, ixtiyoriy) |
| `CRON_SECRET` | cron endpoint himoyasi (ixtiyoriy) |

> `frontend` uchun `VITE_API_URL` **bermang** — bo'sh bo'lsa same-origin
> (`/api` rewrite) ishlaydi. Berilsa, faqat shu domen ishlaydi.

> **Bazani tayyorlash:** Vercel'da `RUN_MIGRATIONS_ON_START=false` bo'lgani uchun
> sxema avtomatik yaratilmaydi. Bir marta qo'lda bajaring (lokal kompyuterdan,
> `backend/` ichida, produksiya `DATABASE_URL` bilan):
> `npm run prisma:migrate && npm run seed`.

### Domenni ulash

```bash
npx vercel domains add teacher.<domen>.uz teacher-web
npx vercel domains verify teacher.<domen>.uz   # kerakli DNS yozuvni ko'rsatadi
```

DNS provayderda ko'rsatilgan CNAME yozuvini qo'shing
(masalan: `teacher` → `cname.vercel-dns.com`).

### Cheklovlar (muhim!)

- **Vercel Functions body limiti 4.5 MB** — shundan katta fayl/video yuklab bo'lmaydi.
  Katta videolar uchun VPS ishlatilsin.
- **Cron (dars eslatmalari):** Hobby tarifda kuniga 1 marta ishlaydi. Har daqiqada
  kerak bo'lsa Pro tarifga o'tib `vercel.json` ga qo'shing:
  `"crons": [{ "path": "/api/cron/lesson-reminders", "schedule": "* * * * *" }]`
- **WebSocket** Vercelda beta holatida; `REDIS_URL` (Upstash) bersangiz bir nechta
  instance orasida chat to'g'ri ishlaydi, aks holda faqat bitta instance ko'radi.

To'liq funksiyalar (katta video, tez-tez cron, barqaror WebSocket) uchun **VPS** tavsiya etiladi.

## 7. Xavfsizlik eslatmalari

- `JWT_SECRET` va barcha parollarni albatta o'zgartiring.
- `CORS_ORIGIN` faqat o'z domeningizni o'z ichiga olsin.
- Caddy HTTPS (`https://`) avtomatik sozlaydi; HTTP → HTTPS yo'naltiriladi.
- Proxy yuklash hajmi cheklovi `Caddyfile` (`request_body max_size`) va
  frontend `nginx.conf` (`client_max_body_size 300m`) da belgilangan.
- Login brutingdan `LOGIN_MAX_ATTEMPTS`/`LOGIN_BLOCK_MINUTES` himoya qiladi.
