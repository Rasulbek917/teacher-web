import { Injectable } from '@nestjs/common';

interface AttemptRecord {
  count: number;
  lockUntil: number | null;
}

/**
 * Login urinishlarini cheklash. Bitta backend instansi uchun xotirada saqlanadi.
 *
 * DIQQAT: `process.env` modul darajasida emas, konstruktorda o'qiladi —
 * aks holda qiymatlar ConfigModule `.env` ni yuklashidan oldin (import paytida)
 * baholanib qolardi.
 */
@Injectable()
export class LoginAttemptsService {
  private attempts = new Map<string, AttemptRecord>();
  private readonly maxAttempts: number;
  private readonly blockMs: number;

  constructor() {
    this.maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10) || 5;
    this.blockMs =
      (parseInt(process.env.LOGIN_BLOCK_MINUTES || '5', 10) || 5) * 60000;
  }

  /** Bloklangan bo'lsa qolgan millisekundni qaytaradi, aks holda 0. */
  lockedFor(key: string): number {
    const rec = this.attempts.get(key);
    if (!rec || !rec.lockUntil) return 0;
    const remaining = rec.lockUntil - Date.now();
    if (remaining <= 0) {
      this.attempts.delete(key);
      return 0;
    }
    return remaining;
  }

  fail(key: string): void {
    const rec = this.attempts.get(key) || { count: 0, lockUntil: null };
    rec.count += 1;
    if (rec.count >= this.maxAttempts) {
      rec.lockUntil = Date.now() + this.blockMs;
      rec.count = 0;
    }
    this.attempts.set(key, rec);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
