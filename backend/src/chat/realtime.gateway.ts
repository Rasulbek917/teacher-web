import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

/** CORS uchun ruxsat etilgan originlar (ishga tushish paytida o'qiladi). */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@WebSocketGateway({
  cors: {
    // `origin: true` o'rniga aniq ro'yxat (kredensialli so'rovlar uchun xavfsiz).
    origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
      if (!origin || allowedOrigins().includes(origin)) cb(null, true);
      else cb(new Error('CORS ruxsat etilmagan'));
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger('RealtimeGateway');

  /** Online foydalanuvchilar: userId -> ochiq socketlar soni (multi-tab). */
  private readonly onlineCounts = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private chat: ChatService,
  ) {}

  /**
   * Ko'p instance (masalan Vercel yoki bir nechta konteyner) uchun Redis adapter.
   * `REDIS_URL` berilmasa xotiradagi standart adapter ishlatiladi (VPS uchun yetarli).
   */
  async afterInit(server: Server) {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('redis');
      const pub = createClient({ url });
      const sub = pub.duplicate();
      await Promise.all([pub.connect(), sub.connect()]);
      server.adapter(createAdapter(pub as any, sub as any));
      this.logger.log('Socket.IO Redis adapter ulandi');
    } catch (e) {
      this.logger.warn(`Socket.IO Redis adapter ulanmadi: ${e}`);
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.jwt.verifyAsync<{ sub: string; tv?: number }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isBlocked: true, tokenVersion: true },
      });
      if (!user || user.isBlocked) {
        client.disconnect();
        return;
      }
      // Parol o'zgargan bo'lsa eski token bilan ulanishga ruxsat bermaymiz.
      if ((payload.tv ?? 0) !== user.tokenVersion) {
        client.disconnect();
        return;
      }
      client.data.userId = user.id;
      await client.join(`user:${user.id}`);

      const parts = await this.prisma.conversationParticipant.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
      });
      for (const p of parts) await client.join(`conv:${p.conversationId}`);

      // Presence: birinchi socket ochilganda online deb belgilaymiz.
      const prev = this.onlineCounts.get(user.id) || 0;
      this.onlineCounts.set(user.id, prev + 1);
      client.emit('presence:init', this.onlineUserIds());
      if (prev === 0) {
        this.server?.emit('presence:update', { userId: user.id, online: true });
      }
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    const next = (this.onlineCounts.get(userId) || 1) - 1;
    if (next <= 0) {
      this.onlineCounts.delete(userId);
      if (this.server) {
        this.server.emit('presence:update', { userId, online: false });
      }
    } else {
      this.onlineCounts.set(userId, next);
    }
  }

  /** Foydalanuvchi hozir online (kamida bitta ochiq socketi bor)mi? */
  isOnline(userId: string): boolean {
    return (this.onlineCounts.get(userId) || 0) > 0;
  }

  /** Hozir online bo'lgan barcha foydalanuvchi id'lari. */
  onlineUserIds(): string[] {
    const ids: string[] = [];
    for (const [id, count] of this.onlineCounts) {
      if (count > 0) ids.push(id);
    }
    return ids;
  }

  emitToUser(userId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  async emitToConversationUsers(
    conversationId: string,
    event: string,
    payload: any,
  ) {
    if (!this.server) return;
    const ids = await this.chat.participantIds(conversationId);
    for (const id of ids) this.server.to(`user:${id}`).emit(event, payload);
  }

  /** Foydalanuvchining barcha ochiq socketlarini majburan uzadi (bloklash/parol). */
  disconnectUser(userId: string) {
    if (!this.server) return;
    const room = this.server.sockets.adapter.rooms.get(`user:${userId}`);
    if (!room) return;
    for (const socketId of room) {
      this.server.sockets.sockets.get(socketId)?.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    try {
      await this.chat.assertParticipant(client.data.userId, body.conversationId);
      await client.join(`conv:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('message:read')
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    try {
      await this.chat.markRead(client.data.userId, body.conversationId);
      await this.emitToConversationUsers(body.conversationId, 'message:read', {
        conversationId: body.conversationId,
        userId: client.data.userId,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
