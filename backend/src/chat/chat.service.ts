import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationType, MessageType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';

const senderSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
} as const;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
  ) {}

  private shapeMessage(m: any) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: m.sender,
      type: m.type,
      text: m.text,
      fileUrl: m.fileUrl,
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      readBy: (m.reads || []).map((r: any) => r.userId),
    };
  }

  async assertParticipant(userId: string, conversationId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!p) throw new ForbiddenException('Bu suhbatga ruxsat yo\'q');
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        group: { select: { id: true, name: true, level: true } },
        participants: {
          include: { user: { select: senderSelect } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: senderSelect } },
        },
      },
    });

    const unreadRows = await this.prisma.$queryRaw<
      { cid: string; cnt: number }[]
    >`
      SELECT m."conversationId" AS cid, COUNT(*)::int AS cnt
      FROM "Message" m
      JOIN "ConversationParticipant" cp
        ON cp."conversationId" = m."conversationId" AND cp."userId" = ${userId}
      WHERE m."senderId" <> ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM "MessageRead" mr
          WHERE mr."messageId" = m.id AND mr."userId" = ${userId}
        )
      GROUP BY m."conversationId"
    `;
    const unreadMap = new Map(unreadRows.map((r) => [r.cid, Number(r.cnt)]));

    return conversations.map((c) => {
      const other = c.participants.find((p) => p.userId !== userId)?.user;
      const last = c.messages[0];
      return {
        id: c.id,
        type: c.type,
        groupId: c.groupId,
        groupName: c.group?.name || null,
        title:
          c.type === ConversationType.GROUP
            ? c.group?.name || 'Guruh'
            : other
              ? `${other.firstName} ${other.lastName}`
              : 'Suhbat',
        avatarUrl: c.type === ConversationType.DIRECT ? other?.avatarUrl || null : null,
        otherUser: other || null,
        lastMessage: last
          ? {
              text: last.text,
              type: last.type,
              senderId: last.senderId,
              senderName: `${last.sender.firstName} ${last.sender.lastName}`,
              createdAt: last.createdAt,
            }
          : null,
        unreadCount: unreadMap.get(c.id) || 0,
      };
    });
  }

  async getMessages(userId: string, conversationId: string, query: any) {
    await this.assertParticipant(userId, conversationId);
    const take = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const before = query.before as string | undefined;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        sender: { select: senderSelect },
        reads: { select: { userId: true } },
      },
    });
    return messages.reverse().map((m) => this.shapeMessage(m));
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: { type: MessageType; text?: string; fileUrl?: string },
  ) {
    await this.assertParticipant(userId, conversationId);

    const text = dto.text?.trim() || null;
    const fileUrl = dto.fileUrl?.trim() || null;

    // Bo'sh xabar (na matn, na fayl) yuborilmasin.
    if (!text && !fileUrl) {
      throw new BadRequestException('Xabar matni yoki fayl kerak');
    }

    // Fayl FAQAT shu foydalanuvchi shu suhbatga yuklagan bo'lishi kerak
    // (begona/tegishli bo'lmagan faylni "ulash"ning oldini oladi).
    if (fileUrl) {
      const owned = await this.files.isOwnedConversationFile(
        fileUrl,
        conversationId,
        userId,
      );
      if (!owned) {
        throw new BadRequestException("Fayl bu suhbatga tegishli emas");
      }
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        type: dto.type,
        text,
        fileUrl,
      },
      include: {
        sender: { select: senderSelect },
        reads: { select: { userId: true } },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    return this.shapeMessage(message);
  }

  async editMessage(userId: string, messageId: string, text: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Xabar topilmadi');
    if (message.senderId !== userId) {
      throw new ForbiddenException('Faqat o\'z xabaringizni tahrirlashingiz mumkin');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
      include: {
        sender: { select: senderSelect },
        reads: { select: { userId: true } },
      },
    });
    return this.shapeMessage(updated);
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Xabar topilmadi');
    if (message.senderId !== userId) {
      throw new ForbiddenException('Faqat o\'z xabaringizni o\'chirishingiz mumkin');
    }
    await this.prisma.message.delete({ where: { id: messageId } });
    // Faqat shu foydalanuvchi shu suhbatga yuklagan faylni o'chiramiz.
    if (message.fileUrl) {
      await this.files.removeConversationFileOwnedBy(
        message.fileUrl,
        message.conversationId,
        userId,
      );
    }
    return { deleted: true, conversationId: message.conversationId, fileUrl: message.fileUrl };
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    const unread = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    if (unread.length) {
      await this.prisma.messageRead.createMany({
        data: unread.map((m) => ({ messageId: m.id, userId })),
        skipDuplicates: true,
      });
    }
    return { success: true, count: unread.length };
  }

  async getReaders(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Xabar topilmadi');
    await this.assertParticipant(userId, message.conversationId);
    const reads = await this.prisma.messageRead.findMany({
      where: { messageId },
      include: { user: { select: senderSelect } },
    });
    return reads.map((r) => r.user);
  }

  async startDirect(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new ForbiddenException('Noto\'g\'ri foydalanuvchi');

    const users = await this.prisma.user.findMany({
      where: { id: { in: [userId, otherUserId] } },
      select: { id: true, role: true },
    });
    const me = users.find((u) => u.id === userId);
    const other = users.find((u) => u.id === otherUserId);
    if (!me || !other) throw new NotFoundException('Foydalanuvchi topilmadi');

    // O'qituvchi <-> o'quvchi: umumiy guruh bo'lishi shart
    const teacherId = me.role === Role.TEACHER ? me.id : other.role === Role.TEACHER ? other.id : null;
    const studentId = me.role === Role.STUDENT ? me.id : other.role === Role.STUDENT ? other.id : null;
    if (teacherId && studentId) {
      const shared = await this.prisma.groupMembership.findFirst({
        where: { studentId, group: { teacherId } },
        select: { id: true },
      });
      if (!shared) throw new ForbiddenException('Umumiy guruh yo\'q');
    } else {
      throw new ForbiddenException('Shaxsiy chat faqat o\'qituvchi va o\'quvchi o\'rtasida');
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (existing) return { id: existing.id };

    const conv = await this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        participants: {
          create: [{ userId }, { userId: otherUserId }],
        },
      },
    });
    return { id: conv.id };
  }

  /** Chat odamlar ro'yxati (o'qituvchi uchun: o'quvchilar; o'quvchi uchun: o'qituvchilar). */
  async contacts(userId: string, role: Role) {
    if (role === Role.TEACHER) {
      const rows = await this.prisma.user.findMany({
        where: {
          role: Role.STUDENT,
          memberships: { some: { group: { teacherId: userId } } },
        },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        orderBy: { firstName: 'asc' },
      });
      return rows;
    }
    if (role === Role.STUDENT) {
      const rows = await this.prisma.user.findMany({
        where: {
          role: Role.TEACHER,
          teacherGroups: { some: { memberships: { some: { studentId: userId } } } },
        },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        orderBy: { firstName: 'asc' },
      });
      return rows;
    }
    return [];
  }

  async participantIds(conversationId: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
