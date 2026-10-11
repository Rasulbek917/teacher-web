/**
 * Muhit o'zgaruvchilarini xavfsiz o'qish uchun yordamchi.
 *
 * Muammo: `JwtModule.register({ secret: process.env.JWT_SECRET })` modul import
 * qilinayotganda (ya'ni ConfigModule .env ni yuklashidan oldin) baholanadi.
 * Shu sababli sir `dev_secret` bo'lib qolishi mumkin edi.
 *
 * Yechim: barcha sirlarni faqat ishga tushish (factory/konstruktor) paytida
 * o'qiymiz va production'da zaif qiymatlarni rad etamiz.
 */

const DEV_SECRET = 'dev_secret';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** JWT sirini qaytaradi. Production'da zaif/yo'q bo'lsa xato beradi. */
export function jwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (isProduction()) {
    if (
      secret.length < 32 ||
      secret === DEV_SECRET ||
      secret.includes('CHANGE_ME')
    ) {
      throw new Error(
        "JWT_SECRET production uchun majburiy va kamida 32 belgidan iborat bo'lishi kerak",
      );
    }
  }
  return secret || DEV_SECRET;
}

/** JWT amal qilish muddati. */
export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d';
}

/**
 * Production'da sir bo'lishi shart bo'lgan muhit o'zgaruvchilarini tekshiradi.
 * main.ts da bir marta chaqiriladi (fail-fast).
 */
export function assertProductionEnv(): void {
  if (!isProduction()) return;
  jwtSecret(); // JWT_SECRET ni tekshiradi (xato bersa ilova ishga tushmaydi)
}
