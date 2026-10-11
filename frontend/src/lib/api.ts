import axios, { AxiosError } from 'axios';

export const API_URL: string =
  (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

export const tokenStore = {
  get: () => localStorage.getItem('et_token'),
  set: (t: string) => localStorage.setItem('et_token', t),
  clear: () => localStorage.removeItem('et_token'),
};

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 120000,
  // HttpOnly fayl cookie'sini yuborish/olish uchun (fayllarga ruxsat).
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

/** Xato xabari (backenddan kelgan yoki umumiy). */
export function errMsg(e: any, fallback = 'Xatolik yuz berdi'): string {
  const data: any = e?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (Array.isArray(data?.message) && data.message.length) {
    const first: any = data.message[0];
    return typeof first === 'string' ? first : first?.message || fallback;
  }
  return e?.message || fallback;
}

/**
 * Fayl url: `API_URL` + yo'l. Token endi URL'da uzatilmaydi (u tarixga,
 * Referer'ga va server loglariga tushib qolardi). Fayllarga ruxsat HttpOnly
 * cookie orqali beriladi (qarang: backend/auth.controller.ts).
 */
export function fileUrl(url?: string | null): string {
  if (!url) return '';
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}