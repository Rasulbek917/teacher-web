/**
 * BARCHA o'qituvchilarni o'chiradi (API orqali — xavfsiz kaskad + fayl tozalash).
 *
 * Ishlatish (backend/ papkasi ichida):
 *   node delete-all-teachers.mjs --yes superadmin superadmin123
 *
 * DIQQAT: bu amal QAYTARIB BO'LMAYDI.
 * O'chiriladi: o'qituvchi, uning guruhlari, materiallari, uy vazifalari,
 * topshiriqlari, davomati, to'lovlari, chatlari va FAQAT shu o'qituvchiga
 * tegishli bo'lgan o'quvchilar. Superadmin va aloqasi bo'lmagan ma'lumotlar
 * saqlanadi.
 *
 * Parolni xohlasangiz arg o'rniga muhit o'zgaruvchisi orqali bering:
 *   SUPERADMIN_LOGIN=... SUPERADMIN_PASSWORD=... node delete-all-teachers.mjs --yes
 */
const BASE = process.env.API_URL || 'http://localhost:3000/api';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const positional = args.filter((a) => !a.startsWith('--'));
const login = positional[0] || process.env.SUPERADMIN_LOGIN || 'superadmin';
const password = positional[1] || process.env.SUPERADMIN_PASSWORD || 'superadmin123';

const req = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
};

(async () => {
  if (!yes) {
    console.error("To'xtatildi: bu buyruq BARCHA o'qituvchilarni o'chiradi.");
    console.error("Davom etish uchun oxiriga --yes qo'shing.");
    process.exit(1);
  }

  const auth = await req('POST', '/auth/login', { body: { login, password } });
  if (auth.status !== 200 || !auth.data?.token) {
    console.error('Login amalga oshmadi:', auth.status, JSON.stringify(auth.data));
    process.exit(1);
  }
  const token = auth.data.token;
  console.log(`Superadmin sifatida kirildi: ${login}`);

  let total = 0;
  for (;;) {
    const page = await req('GET', '/teachers?page=1&pageSize=100', { token });
    if (page.status !== 200 || !Array.isArray(page.data?.items)) {
      console.error("Ro'yxatni olishda xato:", page.status, JSON.stringify(page.data));
      process.exit(1);
    }
    const items = page.data.items;
    if (items.length === 0) break;

    for (const t of items) {
      const del = await req('DELETE', `/teachers/${t.id}`, {
        token,
        body: { login: t.login },
      });
      if (del.status === 200) {
        total++;
        console.log(`  o'chirildi: ${t.firstName} ${t.lastName} (@${t.login})`);
      } else {
        console.error(`  XATO: @${t.login} ->`, del.status, JSON.stringify(del.data));
      }
    }
  }

  console.log(`\nJami o'chirilgan o'qituvchilar: ${total}`);
})().catch((e) => {
  console.error('Kutilmagan xato:', e);
  process.exit(1);
});
