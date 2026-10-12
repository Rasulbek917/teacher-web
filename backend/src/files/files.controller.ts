import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { FileScope, Role } from '@prisma/client';
import { FilesService, UploadKind } from './files.service';
import { getBlobStream } from './blob.storage';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { chunkMulterOptions } from './multer.config';

/** Vercel proksi ~4.5MB so'rov limitidan kichik bo'lak chegarasi. */
const CHUNK_MAX_MB = 4;

@Controller('files')
export class FilesController {
  constructor(
    private files: FilesService,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  /** `Cookie` sarlavhasidan bitta cookie qiymatini oladi. */
  private readCookie(req: Request, name: string): string | undefined {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      if (k === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  private async resolveUserId(req: Request, token?: string): Promise<string> {
    let raw = token;
    if (!raw) {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) raw = auth.slice(7);
    }
    // <img>/<video>/yuklab olish so'rovlari Authorization sarlavhasini
    // yubora olmaydi — shu sababli HttpOnly cookie'dan ham o'qiymiz.
    // (Bu JWT ni URL'ga qo'yishdan ko'ra xavfsizroq.)
    if (!raw) raw = this.readCookie(req, 'et_ftoken');
    if (!raw) throw new UnauthorizedException('Token kerak');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(raw);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isBlocked: true, role: true },
      });
      if (!user || user.isBlocked) throw new UnauthorizedException('Ruxsat yo\'q');
      return user.id;
    } catch {
      throw new UnauthorizedException('Token yaroqsiz');
    }
  }

  /**
   * Bo'laklangan yuklash. Vercel proksi bitta so'rovda ~4.5MB dan katta
   * body'ni qabul qilmaydi, shuning uchun katta fayllar bo'laklab yuboriladi.
   * Har bir bo'lak alohida multipart so'rov (≤ 4MB); so'nggi bo'lakda fayl
   * yig'ilib saqlanadi va `{ ok, file }` qaytariladi.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', chunkMulterOptions(CHUNK_MAX_MB)))
  async uploadChunk(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      uploadId?: string;
      chunkIndex?: string;
      totalChunks?: string;
      filename?: string;
      mimeType?: string;
      size?: string;
      kind?: string;
      scope?: string;
      scopeId?: string;
    },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException("Fayl bo'lagi yuklanmadi");
    const result = await this.files.addChunk(user.id, user.role, {
      uploadId: body.uploadId || '',
      chunkIndex: parseInt(body.chunkIndex || '', 10),
      totalChunks: parseInt(body.totalChunks || '', 10),
      filename: body.filename || 'fayl',
      mimeType: body.mimeType || 'application/octet-stream',
      size: parseInt(body.size || '', 10),
      kind: (body.kind || 'file') as UploadKind,
      scope: (body.scope || 'GROUP') as FileScope,
      scopeId: body.scopeId || null,
    }, file.buffer);
    if (result.done) {
      return { ok: true, done: true, file: result.file };
    }
    return { ok: true, done: false };
  }

  @Public()
  @Get(':id')
  async getFile(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = await this.resolveUserId(req, token);
    const { file, path, remoteUrl } = await this.files.authorize(id, userId);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.filename)}"`,
    );

    // Vercel Blob: avtorizatsiyadan keyin stream qilib beramiz (URL oshkor bo'lmaydi).
    if (remoteUrl) {
      const result = await getBlobStream(remoteUrl);
      if (!result || result.statusCode !== 200 || !result.stream) {
        throw new NotFoundException('Fayl serverda topilmadi');
      }
      Readable.fromWeb(result.stream as any).pipe(res);
      return;
    }

    res.sendFile(path as string);
  }
}
