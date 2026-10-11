import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Super Admin seed:
 * - .env dagi SUPERADMIN_* o'zgaruvchilardan olinadi
 * - Agar Super Admin allaqachon mavjud bo'lsa, qayta yaratilmaydi
 * - Parolni .env orqali yangilash uchun SUPERADMIN_RESET_PASSWORD=true qo'ying
 */
async function main() {
  const login = (process.env.SUPERADMIN_LOGIN || 'superadmin').trim();
  const password = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  // Production'da zaif/default Super Admin paroliga ruxsat berilmaydi.
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SUPERADMIN_PASSWORD || password === 'superadmin123')
  ) {
    throw new Error(
      "Production'da SUPERADMIN_PASSWORD majburiy va 'superadmin123' bo'lmasligi kerak",
    );
  }

  const firstName = process.env.SUPERADMIN_FIRSTNAME || 'Super';
  const lastName = process.env.SUPERADMIN_LASTNAME || 'Admin';
  const phone = process.env.SUPERADMIN_PHONE || '+998 90 000 00 00';

  const existing = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
  });

  if (existing) {
    if (process.env.SUPERADMIN_RESET_PASSWORD === 'true') {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, login },
      });
      console.log('Super Admin paroli .env dan yangilandi.');
    } else {
      console.log('Super Admin allaqachon mavjud, seed o\'tkazib yuborildi.');
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      role: Role.SUPER_ADMIN,
      firstName,
      lastName,
      phone,
      login,
      passwordHash,
    },
  });
  console.log(`Super Admin yaratildi (login: ${login}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
