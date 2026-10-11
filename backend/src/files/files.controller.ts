import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { FilesService } from './files.service';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

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

  @Public()
  @Get(':id')
  async getFile(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = await this.resolveUserId(req, token);
    const { file, path } = await this.files.authorize(id, userId);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.sendFile(path);
  }
}
