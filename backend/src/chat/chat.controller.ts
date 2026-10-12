import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileScope, Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { RealtimeGateway } from './realtime.gateway';
import {
  ChatMessagesQueryDto,
  EditMessageDto,
  SendMessageDto,
  StartDirectDto,
} from './dto/chat.dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FilesService } from '../files/files.service';
import { multerOptions } from '../files/multer.config';

@Roles(Role.TEACHER, Role.STUDENT)
@Controller('chat')
export class ChatController {
  constructor(
    private chat: ChatService,
    private realtime: RealtimeGateway,
    private files: FilesService,
  ) {}

  @Get('conversations')
  async conversations(@CurrentUser() user: AuthUser) {
    const list = await this.chat.listConversations(user.id);
    // Presence: DIRECT suhbatda boshqa foydalanuvchining online holatini qo'shamiz.
    return list.map((c) =>
      c.otherUser
        ? { ...c, otherUser: { ...c.otherUser, online: this.realtime.isOnline(c.otherUser.id) } }
        : c,
    );
  }

  @Get('contacts')
  async contacts(@CurrentUser() user: AuthUser) {
    const list = await this.chat.contacts(user.id, user.role);
    return list.map((c) => ({ ...c, online: this.realtime.isOnline(c.id) }));
  }

  @Post('direct')
  startDirect(@CurrentUser() user: AuthUser, @Body() dto: StartDirectDto) {
    return this.chat.startDirect(user.id, dto.userId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ChatMessagesQueryDto,
  ) {
    return this.chat.getMessages(user.id, id, query);
  }

  @Post('conversations/:id/messages')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const msg = await this.chat.sendMessage(user.id, id, dto);
    await this.realtime.emitToConversationUsers(id, 'message:new', msg);
    return msg;
  }

  @Post('conversations/:id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const res = await this.chat.markRead(user.id, id);
    await this.realtime.emitToConversationUsers(id, 'message:read', {
      conversationId: id,
      userId: user.id,
    });
    return res;
  }

  @Post('conversations/:id/upload')
  @UseInterceptors(FileInterceptor('file', multerOptions()))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
  ) {
    // Avval ishtirokchi ekanini tekshiramiz; muvaffaqiyatsiz bo'lsa yuklangan
    // faylni diskdan darhol o'chiramiz (diskni to'ldirib tashlashning oldini oladi).
    try {
      await this.chat.assertParticipant(user.id, id);
    } catch (e) {
      this.files.discard(file);
      throw e;
    }
    const k =
      kind === 'voice'
        ? 'voice'
        : kind === 'video'
          ? 'video'
          : kind === 'image'
            ? 'image'
            : 'file';
    try {
      return await this.files.save(file, k as any, FileScope.CONVERSATION, id, user.id);
    } catch (e) {
      this.files.discard(file);
      throw e;
    }
  }

  @Get('messages/:id/readers')
  readers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.getReaders(user.id, id);
  }

  @Patch('messages/:id')
  async edit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ) {
    const msg = await this.chat.editMessage(user.id, id, dto.text);
    await this.realtime.emitToConversationUsers(msg.conversationId, 'message:updated', msg);
    return msg;
  }

  @Delete('messages/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const res = await this.chat.deleteMessage(user.id, id);
    await this.realtime.emitToConversationUsers(res.conversationId, 'message:deleted', res);
    return { success: true };
  }
}
