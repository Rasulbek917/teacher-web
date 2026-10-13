import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { getPagination, paginate } from '../common/pagination';
import { monthOf, yearOf, parseDateOnly } from '../common/date.util';
import { MarkPaidDto, SetPaymentDeadlineDto, UpdatePaymentDto } from './dto/payment.dto';

function computeStatus(amount: number, price: number): PaymentStatus {
  if (amount <= 0) return PaymentStatus.UNPAID;
  if (amount >= price) return PaymentStatus.PAID;
  return PaymentStatus.PARTIAL;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(teacherId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query, 50);
    const now = new Date();
    const year = parseInt(query.year || String(yearOf(now)), 10);
    const month = parseInt(query.month || String(monthOf(now)), 10);
    const groupId = query.groupId as string | undefined;

    const memberWhere: any = { group: { teacherId } };
    if (groupId && groupId !== 'all') memberWhere.groupId = groupId;
    if (search) {
      memberWhere.student = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Sahifalash endi DB darajasida: faqat kerakli sahifadagi a'zoliklar
    // o'qiladi (500+ o'quvchida ham tez). Umumiy son/`sum`/`unpaid` esa
    // alohida agregat so'rovda hisoblanadi — butun jadval xotiraga olinmaydi.
    const [total, members] = await Promise.all([
      this.prisma.groupMembership.count({ where: memberWhere }),
      this.prisma.groupMembership.findMany({
        where: memberWhere,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              isBlocked: true,
            },
          },
          group: { select: { id: true, name: true, monthlyPrice: true } },
        },
        orderBy: [
          { student: { firstName: 'asc' } },
          { student: { lastName: 'asc' } },
          { id: 'asc' },
        ],
        skip,
        take,
      }),
    ]);

    const studentIds = [...new Set(members.map((m) => m.studentId))];
    const payments = studentIds.length
      ? await this.prisma.payment.findMany({
          where: {
            teacherId,
            studentId: { in: studentIds },
            periodYear: year,
            periodMonth: month,
          },
        })
      : [];
    const payMap = new Map(payments.map((p) => [`${p.studentId}:${p.groupId}`, p]));

    const rows = members.map((m) => {
      const price = m.customPrice ?? m.group.monthlyPrice;
      const p = payMap.get(`${m.studentId}:${m.groupId}`);
      const amount = p?.amount ?? 0;
      return {
        studentId: m.studentId,
        student: m.student,
        groupId: m.groupId,
        groupName: m.group.name,
        price,
        amount,
        status: p ? p.status : PaymentStatus.UNPAID,
        paidAt: p?.paidAt ?? null,
        paymentId: p?.id ?? null,
        periodYear: year,
        periodMonth: month,
      };
    });

    // Butun filtr uchun yig'indi va to'lanmaganlar soni — bitta agregat SQL.
    const conds: string[] = ['g."teacherId" = $1'];
    const params: any[] = [teacherId];
    if (groupId && groupId !== 'all') {
      params.push(groupId);
      conds.push(`m."groupId" = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(u."firstName" ILIKE $${params.length} OR u."lastName" ILIKE $${params.length})`);
    }
    params.push(year);
    const yi = params.length;
    params.push(month);
    const mi = params.length;
    params.push(teacherId);
    const ti = params.length;
    const aggRows = await this.prisma.$queryRawUnsafe<
      { sum: bigint | number; unpaid: number }[]
    >(
      `SELECT COALESCE(SUM(COALESCE(p.amount, 0)), 0)::bigint AS sum,
              COUNT(*) FILTER (WHERE p.status IS DISTINCT FROM 'PAID')::int AS unpaid
         FROM "GroupMembership" m
         JOIN "Group" g ON g.id = m."groupId"
         JOIN "User" u ON u.id = m."studentId"
         LEFT JOIN "Payment" p
           ON p."studentId" = m."studentId"
          AND p."groupId" = m."groupId"
          AND p."periodYear" = $${yi}
          AND p."periodMonth" = $${mi}
          AND p."teacherId" = $${ti}
        WHERE ${conds.join(' AND ')}`,
      ...params,
    );
    const sum = Number(aggRows[0]?.sum ?? 0);
    const unpaid = Number(aggRows[0]?.unpaid ?? 0);

    const deadline = await this.prisma.paymentDeadline.findUnique({
      where: {
        teacherId_periodYear_periodMonth: {
          teacherId,
          periodYear: year,
          periodMonth: month,
        },
      },
    });

    return {
      ...paginate(rows, total, page, pageSize),
      sum,
      unpaid,
      deadline: deadline?.dueDate ?? null,
    };
  }

  /** Tanlangan oy uchun to'lov muddatini qaytaradi. */
  async getDeadline(teacherId: string, year: number, month: number) {
    const deadline = await this.prisma.paymentDeadline.findUnique({
      where: {
        teacherId_periodYear_periodMonth: {
          teacherId,
          periodYear: year,
          periodMonth: month,
        },
      },
    });
    return { dueDate: deadline?.dueDate ?? null };
  }

  /** Tanlangan oy uchun to'lov muddatini o'rnatadi (yoki o'chiradi). */
  async setDeadline(teacherId: string, dto: SetPaymentDeadlineDto) {
    const key = {
      teacherId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
    };
    if (!dto.dueDate) {
      await this.prisma.paymentDeadline
        .delete({ where: { teacherId_periodYear_periodMonth: key } })
        .catch(() => undefined);
      return { dueDate: null };
    }
    const dueDate = parseDateOnly(dto.dueDate.slice(0, 10));
    const saved = await this.prisma.paymentDeadline.upsert({
      where: { teacherId_periodYear_periodMonth: key },
      create: { ...key, dueDate },
      update: { dueDate },
    });
    return { dueDate: saved.dueDate };
  }

  async markPaid(teacherId: string, dto: MarkPaidDto) {
    await this.access.assertTeacherOwnsGroup(teacherId, dto.groupId);
    await this.access.assertStudentInGroup(dto.studentId, dto.groupId);

    const [group, student, membership] = await Promise.all([
      this.prisma.group.findUnique({ where: { id: dto.groupId } }),
      this.prisma.user.findUnique({
        where: { id: dto.studentId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.groupMembership.findUnique({
        where: {
          groupId_studentId: { groupId: dto.groupId, studentId: dto.studentId },
        },
      }),
    ]);
    if (!group || !student || !membership) {
      throw new NotFoundException('Ma\'lumot topilmadi');
    }

    const price = membership.customPrice ?? group.monthlyPrice;
    const status = computeStatus(dto.amount, price);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : status === PaymentStatus.UNPAID ? null : new Date();

    const data = {
      studentName: `${student.firstName} ${student.lastName}`,
      groupName: group.name,
      priceSnapshot: price,
      amount: dto.amount,
      status,
      paidAt,
    };

    // Bir o'quvchi+guruh+oy uchun bitta yozuv (unique constraint + upsert).
    return this.prisma.payment.upsert({
      where: {
        studentId_groupId_periodYear_periodMonth: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
        },
      },
      create: {
        teacherId,
        studentId: dto.studentId,
        groupId: dto.groupId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        ...data,
      },
      update: data,
    });
  }

  async update(teacherId: string, id: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, teacherId },
    });
    if (!payment) throw new NotFoundException('To\'lov topilmadi');

    const amount = dto.amount ?? payment.amount;
    const status = computeStatus(amount, payment.priceSnapshot);
    return this.prisma.payment.update({
      where: { id },
      data: {
        amount,
        status,
        paidAt:
          dto.paidAt !== undefined
            ? dto.paidAt
              ? new Date(dto.paidAt)
              : null
            : status === PaymentStatus.UNPAID
              ? null
              : payment.paidAt ?? new Date(),
      },
    });
  }

  async cancel(teacherId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, teacherId },
    });
    if (!payment) throw new NotFoundException('To\'lov topilmadi');
    await this.prisma.payment.delete({ where: { id } });
    return { success: true };
  }

  /** O'quvchi o'z to'lov holatini ko'radi. */
  async studentPayments(studentId: string) {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { studentId },
      include: { group: { select: { id: true, name: true, monthlyPrice: true } } },
    });
    const payments = await this.prisma.payment.findMany({
      where: { studentId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    const now = new Date();
    const curYear = yearOf(now);
    const curMonth = monthOf(now);

    return memberships.map((m) => {
      const price = m.customPrice ?? m.group.monthlyPrice;
      const from = m.joinedAt;
      const months: any[] = [];

      // Oylar indeksi: y*12 + (m-1). Boshlanish = qo'shilgan oy, lekin
      // joriy oydan ko'pi bilan 23 oy orqaga (jami 24 oy ko'rsatiladi).
      const idx = (y: number, mo: number) => y * 12 + (mo - 1);
      const curIdx = idx(curYear, curMonth);
      let startIdx = idx(yearOf(from), monthOf(from));
      const minIdx = curIdx - 23;
      if (startIdx < minIdx) startIdx = minIdx;

      for (let i = startIdx; i <= curIdx; i++) {
        const y = Math.floor(i / 12);
        const mo = (i % 12) + 1;
        const p = payments.find(
          (pp) =>
            pp.groupId === m.groupId && pp.periodYear === y && pp.periodMonth === mo,
        );
        months.push({
          year: y,
          month: mo,
          status: p ? p.status : PaymentStatus.UNPAID,
          amount: p?.amount ?? 0,
          paidAt: p?.paidAt ?? null,
          price,
        });
      }
      months.reverse();
      return {
        groupId: m.group.id,
        groupName: m.group.name,
        price,
        months,
      };
    });
  }
}
