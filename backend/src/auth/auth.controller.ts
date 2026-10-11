import { Body, Controller, Get, Ip, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/** Fayllarga (`<img>`, `<video>`, yuklab olish) cookie orqali ruxsat. */
const FILE_COOKIE = 'et_ftoken';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setFileCookie(res: Response, token: string) {
    res.cookie(FILE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/files',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, ip);
    this.setFileCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('register-teacher')
  async registerTeacher(
    @Body() dto: RegisterTeacherDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerTeacher(dto);
    this.setFileCookie(res, result.token);
    return result;
  }

  @Get('me')
  me(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Har bir ilova ochilganda fayl cookie'sini yangilab turamiz (eski
    // sessiyalarda cookie yo'qolgan bo'lsa ham fayllar ochiladi).
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) this.setFileCookie(res, auth.slice(7));
    return this.auth.me(user.id);
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(FILE_COOKIE, { path: '/api/files' });
    return { success: true };
  }
}
