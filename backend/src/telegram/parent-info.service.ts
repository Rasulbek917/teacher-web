import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dayOfWeek, formatDate, startOfDay, endOfDay } from '../common/date.util';

const WEEKDAYS_SHORT = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sh', 'Ya'];
const WEEKDAYS_FULL = [
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
  'Yakshanba',
];

const NOT_LINKED =
  `Siz hali o'qituvchiga ulanmagansiz. 🔗\n` +
  `Ulanish uchun o'qituvchi bergan havolani oching.\n` +
  `Yordam: /help`;

/** Uzun matnni Telegram limitiga sig'adigan qilib qisqartiradi. */
function clip(text: string, max = 500): string {
  const t = (text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Ota-onaga Telegram bot orqali farzandi haqidagi ma'lumotni (uyga vazifa,
 * baholar) tayyorlaydi. Faqat shu chatId ga ulangan o'quvchilar ko'rinadi.
 */
@Injectable()
export class ParentInfoService {
  constructor(private prisma: PrismaService) {}

  /** ChatId ga ulangan o'quvchilar (aka-uka bo'lsa bir nechta bo'lishi mumkin). */
  private async linkedStudents(chatId: string) {
    const profiles = await this.prisma.studentProfile.findMany({
      where: { parentTelegramChatId: chatId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            memberships: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    lessonDays: true,
                    lessonTime: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return profiles.map((p) => p.user);
  }

  private groupLabel(g: {
    lessonDays: number[];
    lessonTime: string;
    name: string;
  }): string {
    const days = g.lessonDays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS_SHORT[d - 1] || '')
      .filter(Boolean)
      .join(', ');
    return `${g.name} — ${days || 'kunlar yo\'q'}, ${g.lessonTime}`;
  }

  /** "/homework" uchun matn: bugungi dars kuni berilgan uyga vazifa. */
  async homeworkMessage(chatId: string): Promise<string> {
    const students = await this.linkedStudents(chatId);
    if (!students.length) return NOT_LINKED;

    const now = new Date();
    const dow = dayOfWeek(now);
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const blocks: string[] = [];
    for (const s of students) {
      const groups = s.memberships.map((m) => m.group);
      const groupsToday = groups.filter((g) => g.lessonDays.includes(dow));
      // Bugun darsi bor guruhlarni ko'rsatamiz; aks holda barcha guruhlar.
      const targetGroups = groupsToday.length ? groupsToday : groups;

      const items: string[] = [];
      for (const g of targetGroups) {
        const createdToday = await this.prisma.homework.findMany({
          where: { groupId: g.id, createdAt: { gte: dayStart, lte: dayEnd } },
          orderBy: { createdAt: 'desc' },
          take: 3,
        });
        const list = createdToday.length
          ? createdToday
          : await this.prisma.homework.findMany({
              where: { groupId: g.id },
              orderBy: { createdAt: 'desc' },
              take: 2,
            });
        if (!list.length) continue;

        const todayMark = g.lessonDays.includes(dow) ? ' — bugun dars ✅' : '';
        const hwLines = list.map((h) => {
          const parts = [`• ${h.title}`];
          if (h.description) parts.push(`  ${clip(h.description, 400)}`);
          parts.push(`  Berilgan: ${formatDate(h.createdAt)}`);
          parts.push(`  Muddat: ${h.dueAt ? formatDate(h.dueAt) : 'belgilanmagan'}`);
          if (h.attachmentUrls?.length) {
            parts.push(`  📎 ${h.attachmentUrls.length} ta fayl`);
          }
          return parts.join('\n');
        });
        items.push(`🏫 ${this.groupLabel(g)}${todayMark}\n${hwLines.join('\n')}`);
      }

      if (!items.length) items.push('Hozircha uyga vazifa berilmagan.');

      blocks.push(
        students.length > 1
          ? `👤 ${s.firstName} ${s.lastName}\n${items.join('\n\n')}`
          : items.join('\n\n'),
      );
    }

    return (
      `📚 Uyga vazifa\n` +
      `📅 ${formatDate(now)} (${WEEKDAYS_FULL[dow - 1]})\n\n` +
      blocks.join('\n\n')
    );
  }

  /** "/grade" uchun matn: oxirgi baholar. */
  async gradesMessage(chatId: string): Promise<string> {
    const students = await this.linkedStudents(chatId);
    if (!students.length) return NOT_LINKED;

    const blocks: string[] = [];
    for (const s of students) {
      const submissions = await this.prisma.submission.findMany({
        where: {
          studentId: s.id,
          OR: [{ grade: { not: null } }, { result: { not: null } }],
        },
        orderBy: [
          { reviewedAt: { sort: 'desc', nulls: 'last' } },
          { submittedAt: 'desc' },
        ],
        take: 12,
        include: { homework: { select: { title: true } } },
      });

      if (!submissions.length) {
        blocks.push(
          students.length > 1
            ? `👤 ${s.firstName} ${s.lastName}\nHozircha baho qo'yilmagan.`
            : 'Hozircha baho qo\'yilmagan.',
        );
        continue;
      }

      const lines = submissions.map((sub) => {
        const bits: string[] = [`• ${sub.homework.title}`];
        const marks: string[] = [];
        if (sub.grade !== null && sub.grade !== undefined) {
          marks.push(`Baho: ${sub.grade}`);
        }
        if (sub.result) {
          marks.push(sub.result === 'DONE' ? 'Bajarildi ✅' : 'Xato ⚠️');
        }
        if (marks.length) bits.push(`  ${marks.join(' · ')}`);
        const date = sub.reviewedAt || sub.submittedAt;
        const meta: string[] = [];
        if (date) meta.push(formatDate(date));
        if (sub.comment) meta.push(`Izoh: ${clip(sub.comment, 200)}`);
        if (meta.length) bits.push(`  ${meta.join(' · ')}`);
        return bits.join('\n');
      });

      blocks.push(
        students.length > 1
          ? `👤 ${s.firstName} ${s.lastName}\n${lines.join('\n')}`
          : lines.join('\n'),
      );
    }

    return `📊 Baholar\n\n${blocks.join('\n\n')}`;
  }
}
