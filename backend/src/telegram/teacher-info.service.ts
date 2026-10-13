import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateOnly,
  dayOfWeek,
  formatDate,
  monthOf,
  yearOf,
} from '../common/date.util';
import { TelegramService, formatSum, monthNameUz } from './telegram.service';

const NOT_LINKED_TEACHER =
  `Siz o'qituvchi sifatida hali botga ulanmagansiz. 🔗\n` +
  `Saytdagi «Sozlamalar → Telegram» bo'limidan ulanish havolasini oling.`;

/**
 * O'qituvchi uchun bot buyruqlari: oylik tushum (/oylik) va bugungi davomat
 * (/davomat). Faqat shu chatId ga ulangan o'qituvchi ma'lumotlari ko'rinadi.
 */
@Injectable()
export class TeacherInfoService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /** ChatId ga ulangan o'qituvchi (yoki null). */
  async linkedTeacher(chatId: string) {
    const profile = await this.prisma.teacherProfile.findFirst({
      where: { telegramChatId: chatId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return profile?.user ?? null;
  }

  /** "/oylik" — joriy oy bo'yicha tushum, qarzlar va muddat. */
  async oylikMessage(chatId: string): Promise<string> {
    const teacher = await this.linkedTeacher(chatId);
    if (!teacher) return NOT_LINKED_TEACHER;
    return this.buildOylik(teacher.id);
  }

  async buildOylik(teacherId: string): Promise<string> {
    const nowY = yearOf();
    const nowM = monthOf();

    const [memberships, payments, deadline, groupCount] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { group: { teacherId } },
        select: {
          studentId: true,
          customPrice: true,
          joinedAt: true,
          group: { select: { id: true, monthlyPrice: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { teacherId, periodYear: nowY, periodMonth: nowM },
        select: { studentId: true, groupId: true, amount: true },
      }),
      this.prisma.paymentDeadline.findUnique({
        where: {
          teacherId_periodYear_periodMonth: {
            teacherId,
            periodYear: nowY,
            periodMonth: nowM,
          },
        },
      }),
      this.prisma.group.count({ where: { teacherId } }),
    ]);

    const students = new Set(memberships.map((m) => m.studentId));
    const payMap = new Map(
      payments.map((p) => [`${p.studentId}:${p.groupId}`, p.amount]),
    );

    let expected = 0;
    let collected = 0;
    let unpaid = 0;
    for (const m of memberships) {
      const price = m.customPrice ?? m.group.monthlyPrice;
      expected += price;
      const amount = payMap.get(`${m.studentId}:${m.group.id}`) ?? 0;
      collected += amount;
      if (amount < price) unpaid++;
    }

    const debt = Math.max(0, expected - collected);
    const lines = [
      `💰 Oylik tushum — ${monthNameUz(nowM)} ${nowY}`,
      ``,
      `👨‍🏫 Guruhlar: ${groupCount} ta`,
      `👥 O'quvchilar: ${students.size} ta`,
      `✅ Yig'ildi: ${formatSum(collected)}`,
      `🧾 Kutilgan: ${formatSum(expected)}`,
      `⚠️ To'lanmagan: ${unpaid} ta (${formatSum(debt)})`,
    ];
    if (deadline?.dueDate) {
      lines.push(`📅 To'lov muddati: ${formatDate(deadline.dueDate)}`);
    } else {
      lines.push(`📅 To'lov muddati: belgilanmagan`);
    }
    return lines.join('\n');
  }

  /** "/davomat" — bugungi darslar bo'yicha davomat. */
  async davomatMessage(chatId: string): Promise<string> {
    const teacher = await this.linkedTeacher(chatId);
    if (!teacher) return NOT_LINKED_TEACHER;

    const dow = dayOfWeek();
    const today = dateOnly();
    const groups = await this.prisma.group.findMany({
      where: { teacherId: teacher.id, lessonDays: { has: dow } },
      select: { id: true, name: true, lessonTime: true },
      orderBy: { lessonTime: 'asc' },
    });

    if (!groups.length) {
      return `📅 Bugun (${formatDate(today)}) darsingiz yo'q.`;
    }

    const members = await this.prisma.groupMembership.findMany({
      where: { groupId: { in: groups.map((g) => g.id) } },
      select: { groupId: true, studentId: true },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: {
        groupId: { in: groups.map((g) => g.id) },
        date: today,
      },
      select: { groupId: true, studentId: true, present: true },
    });
    const attMap = new Map(
      attendance.map((a) => [`${a.groupId}:${a.studentId}`, a.present]),
    );

    const blocks: string[] = [
      `📋 Bugungi davomat — ${formatDate(today)}`,
    ];
    for (const g of groups) {
      const ids = members
        .filter((m) => m.groupId === g.id)
        .map((m) => m.studentId);
      let present = 0;
      let absent = 0;
      let notMarked = 0;
      for (const id of ids) {
        const v = attMap.get(`${g.id}:${id}`);
        if (v === true) present++;
        else if (v === false) absent++;
        else notMarked++;
      }
      blocks.push(
        `\n🏫 ${g.name} (${g.lessonTime})\n` +
          `✅ Keldi: ${present} · ❌ Kelmadi: ${absent} · ⏳ Belgilanmagan: ${notMarked}\n` +
          `👥 Jami: ${ids.length} ta`,
      );
    }
    return blocks.join('\n');
  }
}
