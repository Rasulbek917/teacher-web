import { Injectable } from '@nestjs/common';
import { PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { monthOf, yearOf } from '../common/date.util';

/** Foiz o'zgarish: (joriy - oldingi) / oldingi * 100 */
function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async teacherDashboard(teacherId: string, query: any) {
    const now = new Date();
    const year = parseInt(query.year || String(yearOf(now)), 10);
    const month = parseInt(query.month || String(monthOf(now)), 10);

    const members = await this.prisma.groupMembership.findMany({
      where: { group: { teacherId } },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            studentProfile: { select: { parentPhone: true } },
          },
        },
        group: { select: { id: true, name: true, monthlyPrice: true } },
      },
    });

    const groupsCount = await this.prisma.group.count({ where: { teacherId } });
    const studentsCount = new Set(members.map((m) => m.studentId)).size;

    const payments = await this.prisma.payment.findMany({
      where: { teacherId, periodYear: year, periodMonth: month },
      orderBy: { paidAt: 'desc' },
    });

    const payMap = new Map(
      payments.map((p) => [`${p.studentId}:${p.groupId}`, p]),
    );

    const paidList = payments
      .filter((p) => p.amount > 0)
      .map((p) => ({
        id: p.id,
        studentName: p.studentName,
        groupName: p.groupName,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt,
      }));

    const unpaidList = members
      .filter((m) => payMap.get(`${m.studentId}:${m.groupId}`)?.status !== PaymentStatus.PAID)
      .map((m) => ({
        studentId: m.studentId,
        studentName: `${m.student.firstName} ${m.student.lastName}`,
        groupId: m.groupId,
        groupName: m.group.name,
        monthlyPrice: m.customPrice ?? m.group.monthlyPrice,
        parentPhone: m.student.studentProfile?.parentPhone || '',
        paidAmount: payMap.get(`${m.studentId}:${m.groupId}`)?.amount ?? 0,
      }));

    const totalIncome = payments.reduce((a, p) => a + p.amount, 0);

    return {
      year,
      month,
      groupsCount,
      studentsCount,
      totalIncome,
      unpaidCount: unpaidList.length,
      paidList,
      unpaidList,
    };
  }

  async adminDashboard() {
    const nowD = new Date();
    const curY = yearOf(nowD);
    const curM = monthOf(nowD);

    const prevYM = (y: number, m: number) =>
      m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const lastY = prevYM(curY, curM);

    const [
      totalTeachers,
      activeTeachers,
      blockedTeachers,
      totalStudents,
      activeStudents,
      blockedStudents,
      totalGroups,
      totalUsers,
      activeUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.TEACHER } }),
      this.prisma.user.count({ where: { role: Role.TEACHER, isBlocked: false } }),
      this.prisma.user.count({ where: { role: Role.TEACHER, isBlocked: true } }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.user.count({ where: { role: Role.STUDENT, isBlocked: false } }),
      this.prisma.user.count({ where: { role: Role.STUDENT, isBlocked: true } }),
      this.prisma.group.count(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isBlocked: false } }),
    ]);

    // ---- Tushumlar (oylik) — butun to'lov jadvalini xotiraga olmasdan,
    // DB darajasida oy bo'yicha agregat qilamiz (jadval cheksiz o'sadi).
    const revRows = await this.prisma.payment.groupBy({
      by: ['periodYear', 'periodMonth'],
      _sum: { amount: true },
    });
    const revenueByMonth = new Map<string, number>();
    for (const r of revRows) {
      revenueByMonth.set(`${r.periodYear}-${r.periodMonth}`, r._sum.amount ?? 0);
    }
    const revenueThisMonth = revenueByMonth.get(`${curY}-${curM}`) ?? 0;
    const revenueLastMonth = revenueByMonth.get(`${lastY.y}-${lastY.m}`) ?? 0;

    // ---- So'nggi 12 oy o'sish dinamikasi
    const months: { year: number; month: number }[] = [];
    {
      let y = curY;
      let m = curM;
      for (let i = 0; i < 12; i++) {
        months.unshift({ year: y, month: m });
        m -= 1;
        if (m === 0) {
          m = 12;
          y -= 1;
        }
      }
    }

    // Foydalanuvchilarni oy bo'yicha sanash (barcha userlarni yuklamaymiz).
    // `createdAt - 5 soat` => Tashkent oyi (UTC+5), so'ng oy bo'yicha guruhlash.
    const growthRows = await this.prisma.$queryRawUnsafe<
      { ym: string; role: string; n: number }[]
    >(
      `SELECT to_char(date_trunc('month', "createdAt" - interval '5 hours'), 'YYYY-MM') AS ym,
              role::text AS role,
              COUNT(*)::int AS n
         FROM "User"
        WHERE role::text IN ('TEACHER', 'STUDENT')
        GROUP BY 1, 2`,
    );
    const perRole = new Map<string, Map<string, number>>();
    for (const r of growthRows) {
      if (!perRole.has(r.role)) perRole.set(r.role, new Map());
      perRole.get(r.role)!.set(r.ym, Number(r.n));
    }
    /** Berilgan oyga qadar (shu oy ham) yaratilgan userlar soni. */
    const cumulative = (role: string, y: number, m: number): number => {
      const map = perRole.get(role);
      if (!map) return 0;
      const target = `${y}-${String(m).padStart(2, '0')}`;
      let sum = 0;
      for (const [ym, n] of map) if (ym <= target) sum += n;
      return sum;
    };

    const teachersGrowth = months.map((mo) => cumulative('TEACHER', mo.year, mo.month));
    const studentsGrowth = months.map((mo) => cumulative('STUDENT', mo.year, mo.month));
    const revenueGrowth = months.map(
      (mo) => revenueByMonth.get(`${mo.year}-${mo.month}`) ?? 0,
    );

    // ---- Oylik hisobotlar (shu oy vs o'tgan oy)
    const thisKey = `${curY}-${String(curM).padStart(2, '0')}`;
    const lastKey = `${lastY.y}-${String(lastY.m).padStart(2, '0')}`;
    const bucket = (role: string, ym: string) => perRole.get(role)?.get(ym) ?? 0;
    const teachersThisMonth = bucket('TEACHER', thisKey);
    const teachersLastMonth = bucket('TEACHER', lastKey);
    const studentsThisMonth = bucket('STUDENT', thisKey);
    const studentsLastMonth = bucket('STUDENT', lastKey);

    const recentTeachers = await this.prisma.user.findMany({
      where: { role: Role.TEACHER },
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        login: true,
        phone: true,
        avatarUrl: true,
        isBlocked: true,
        createdAt: true,
        _count: { select: { teacherGroups: true } },
      },
    });

    return {
      // Backward compatible
      teachersCount: totalTeachers,
      groupsCount: totalGroups,
      studentsCount: totalStudents,
      // Premium metrics
      totalTeachers,
      activeTeachers,
      blockedTeachers,
      totalStudents,
      activeStudents,
      blockedStudents,
      totalGroups,
      totalUsers,
      activeUsers,
      revenueThisMonth,
      revenueLastMonth,
      revenueTrend: percentChange(revenueThisMonth, revenueLastMonth),
      teacherTrend: percentChange(teachersThisMonth, teachersLastMonth),
      studentTrend: percentChange(studentsThisMonth, studentsLastMonth),
      growth: { months, teachers: teachersGrowth, students: studentsGrowth, revenue: revenueGrowth },
      recentTeachers,
    };
  }
}
