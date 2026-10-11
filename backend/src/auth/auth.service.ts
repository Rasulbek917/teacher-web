import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginAttemptsService } from './login-attempts.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { sanitizeUser } from '../common/user.util';

const INVALID_MSG = "Login yoki parol noto'g'ri";
const BLOCKED_MSG = "Hisobingiz bloklangan, o'qituvchingizga murojaat qiling";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private attempts: LoginAttemptsService,
  ) {}

  private async buildAuthResponse(user: any) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      login: user.login,
      // tokenVersion: parol o'zgarganda eski tokenlar bekor qilinadi.
      tv: user.tokenVersion ?? 0,
    });
    return { token, user: sanitizeUser(user) };
  }

  async login(dto: LoginDto, ip: string) {
    const login = dto.login.trim();
    const key = `${ip}:${login}`;

    const locked = this.attempts.lockedFor(key);
    if (locked > 0) {
      const minutes = Math.ceil(locked / 60000);
      throw new HttpException(
        `Juda ko'p urinish. ${minutes} minutdan so'ng qayta urinib ko'ring`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { login },
      include: { teacherProfile: true, studentProfile: true },
    });

    if (!user) {
      this.attempts.fail(key);
      throw new UnauthorizedException(INVALID_MSG);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      this.attempts.fail(key);
      throw new UnauthorizedException(INVALID_MSG);
    }

    if (user.isBlocked) {
      throw new ForbiddenException(BLOCKED_MSG);
    }

    this.attempts.reset(key);
    return this.buildAuthResponse(user);
  }

  async registerTeacher(dto: RegisterTeacherDto) {
    const login = dto.login.trim();

    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) {
      throw new BadRequestException('Bu login band');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        role: Role.TEACHER,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        login,
        passwordHash,
        teacherProfile: {
          create: {
            centerName: dto.centerName.trim(),
            city: dto.city.trim(),
          },
        },
      },
      include: { teacherProfile: true, studentProfile: true },
    });

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacherProfile: true, studentProfile: true },
    });
    return sanitizeUser(user);
  }
}
