import { Prisma, User } from '@prisma/client';

/** Parol hash'ini hech qachon tashqariga chiqarmaydigan public select. */
export const userPublicSelect = {
  id: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  login: true,
  avatarUrl: true,
  language: true,
  theme: true,
  isBlocked: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = {
  id: string;
  role: User['role'];
  firstName: string;
  lastName: string;
  phone: string;
  login: string;
  avatarUrl: string | null;
  language: User['language'];
  theme: User['theme'];
  isBlocked: boolean;
  createdAt: Date;
};

export function sanitizeUser(user: any): any {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  return rest;
}
