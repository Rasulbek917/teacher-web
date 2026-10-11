import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPagination, paginate } from '../common/pagination';
import { RealtimeGateway } from '../chat/realtime.gateway';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  dedupeKey?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async create(input: CreateNotificationInput) {
    try {
      const notif = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
      this.realtime.emitToUser(input.userId, 'notification:new', notif);
      return notif;
    } catch (e: any) {
      // dedupeKey unique bo'lsa — takroriy xabar yuborilmaydi
      if (e?.code === 'P2002') return null;
      throw e;
    }
  }

  async createForUsers(
    userIds: string[],
    base: Omit<CreateNotificationInput, 'userId' | 'dedupeKey'> & {
      dedupeKeyPrefix?: string;
    },
  ) {
    const rows = userIds.map((uid) => ({
      userId: uid,
      type: base.type,
      title: base.title,
      body: base.body,
      link: base.link ?? null,
      dedupeKey: base.dedupeKeyPrefix ? `${base.dedupeKeyPrefix}:${uid}` : null,
    }));
    if (!rows.length) return;
    await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
    for (const uid of userIds) {
      this.realtime.emitToUser(uid, 'notification:refresh', {});
    }
  }

  async list(userId: string, query: any) {
    const { page, pageSize, skip, take } = getPagination(query, 20);
    const where = { userId };
    const [total, items, unread] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { ...paginate(items, total, page, pageSize), unreadCount: unread };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }
}
