// Asia/Tashkent (UTC+5, DST yo'q) vaqt bilan ishlash uchun yordamchi funksiyalar.
// Bu yerda qaytariladigan Date obyektlari — UTC instanlar (DB uchun), lekin
// ular Tashkent chegaralarini (kun/hafta/oy boshi-oxiri) bildiradi.

export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // +05:00
const DAY_MS = 24 * 60 * 60 * 1000;

/** Hozirgi vaqt (Date instant). */
export function now(): Date {
  return new Date();
}

/** Tashkent vaqti bo'yicha komponentlarni olish uchun "siljigan" sana. */
function shifted(date: Date): Date {
  return new Date(date.getTime() + TASHKENT_OFFSET_MS);
}

/** Kun boshidan (00:00 Tashkent) "siljigan" sanoq. */
function startOfDayShifted(date: Date): number {
  const t = shifted(date);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Tashkent kuni boshlanishi (UTC instant). */
export function startOfDay(date: Date = new Date()): Date {
  return new Date(startOfDayShifted(date) - TASHKENT_OFFSET_MS);
}

/** Tashkent kuni oxiri (UTC instant, 23:59:59.999). */
export function endOfDay(date: Date = new Date()): Date {
  return new Date(startOfDay(date).getTime() + DAY_MS - 1);
}

/**
 * @db.Date ustunlar uchun: Tashkent kalendar sanasini bildiruvchi
 * UTC-midnight Date (masalan Tashkentda 2026-10-10 -> 2026-10-10T00:00:00Z).
 */
export function dateOnly(date: Date = new Date()): Date {
  const t = shifted(date);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

/** "YYYY-MM-DD" ni Tashkent kalendar sanasi sifatida @db.Date ga aylantiradi. */
export function parseDateOnly(input: string): Date {
  const [y, m, d] = input.split('-').map((v) => parseInt(v, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Haftaning dushanbasi (Tashkent), UTC instant. */
export function startOfWeek(date: Date = new Date()): Date {
  const dayStart = startOfDay(date);
  const t = shifted(dayStart);
  const dow = t.getUTCDay(); // 0=Yakshanba..6=Shanba
  const diff = (dow + 6) % 7; // Dushanbagacha bo'lgan kunlar
  return new Date(dayStart.getTime() - diff * DAY_MS);
}

export function endOfWeek(date: Date = new Date()): Date {
  return new Date(startOfWeek(date).getTime() + 7 * DAY_MS - 1);
}

/** Oyning 1-sanasidan. */
export function startOfMonth(date: Date = new Date()): Date {
  const t = shifted(date);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TASHKENT_OFFSET_MS,
  );
}

/** Oyning oxirgi kuni (23:59:59.999). */
export function endOfMonth(date: Date = new Date()): Date {
  const t = shifted(date);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) -
      TASHKENT_OFFSET_MS -
      1,
  );
}

/** Tashkent bo'yicha hafta kuni: 1=Dushanba ... 7=Yakshanba. */
export function dayOfWeek(date: Date = new Date()): number {
  const dow = shifted(date).getUTCDay(); // 0..6
  return dow === 0 ? 7 : dow;
}

/** Oy raqami (1-12) Tashkent bo'yicha. */
export function monthOf(date: Date = new Date()): number {
  return shifted(date).getUTCMonth() + 1;
}

/** Yil Tashkent bo'yicha. */
export function yearOf(date: Date = new Date()): number {
  return shifted(date).getUTCFullYear();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "kun.oy.yil" (10.10.2026). */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  const t = shifted(date);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** "kun.oy.yil soat:daqiqa" 24 soatlik. */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '';
  const t = shifted(date);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t
    .getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** "HH:mm" ni shu kunning (yoki berilgan sananing) Tashkent vaqtiga qo'yadi. */
export function atTimeOnDay(day: Date, time: string): Date {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  const t = shifted(day);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), h || 0, m || 0) -
      TASHKENT_OFFSET_MS,
  );
}
