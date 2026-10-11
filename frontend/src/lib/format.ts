/** Sana va pul formatlash (Asia/Tashkent, 24 soatlik, UZS). */

const OFFSET_MS = 5 * 60 * 60 * 1000;

function shifted(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Date(date.getTime() + OFFSET_MS);
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** kun.oy.yil */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = shifted(d);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** kun.oy.yil soat:daqiqa */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = shifted(d);
  return `${fmtDate(d)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** HH:mm (sana ichidagi vaqt) */
export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = shifted(d);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** 300000 -> "300 000 so'm" */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return `${new Intl.NumberFormat('ru-RU').format(n)} so'm`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0';
  return new Intl.NumberFormat('ru-RU').format(n);
}

const DAY_NAMES = [
  'Yakshanba',
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
];
const DAY_SHORT = ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sh'];

/** 1=Dushanba ... 7=Yakshanba -> nom */
export function dayName(day: number): string {
  return DAY_NAMES[day % 7];
}
export function dayShort(day: number): string {
  return DAY_SHORT[day % 7];
}

export function fmtLessonDays(days: number[]): string {
  if (!days || !days.length) return '-';
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map(dayShort).join(', ');
}

/** YYYY-MM-DD (Tashkent bo'yicha bugungi sana) */
export function todayStr(): string {
  const t = shifted(new Date());
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function yearMonthNow(): { year: number; month: number } {
  const t = shifted(new Date());
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

export const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/** Tashkent bo'yicha bugungi hafta kuni (1=Dushanba ... 7=Yakshanba) */
export function tashkentDayNumber(): number {
  const t = shifted(new Date());
  const jsDay = t.getUTCDay(); // 0=Yakshanba
  return jsDay === 0 ? 7 : jsDay;
}

/** +998 XX XXX XX XX formatida terish */
export function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  if (digits.length > 9) digits = digits.slice(0, 9);
  const parts: string[] = [];
  if (digits.length >= 2) {
    parts.push(digits.slice(0, 2));
    digits = digits.slice(2);
  }
  if (digits.length >= 3) {
    parts.push(digits.slice(0, 3));
    digits = digits.slice(3);
  }
  if (digits.length >= 2) {
    parts.push(digits.slice(0, 2));
    digits = digits.slice(2);
  }
  if (digits.length) parts.push(digits);
  const core = parts.join(' ');
  return `+998 ${core}`.trim();
}

const PHONE_RE = /^\+998 \d{2} \d{3} \d{2} \d{2}$/;
export function isValidPhone(v: string): boolean {
  return PHONE_RE.test(v);
}

export { shifted };