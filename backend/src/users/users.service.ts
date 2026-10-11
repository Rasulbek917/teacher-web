import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { sanitizeUser, userPublicSelect } from '../common/user.util';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacherProfile: true, studentProfile: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return sanitizeUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();

    if (dto.login !== undefined) {
      const login = dto.login.trim();
      const exists = await this.prisma.user.findUnique({ where: { login } });
      if (exists && exists.id !== userId) {
        throw new BadRequestException('Bu login band');
      }
      data.login = login;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: userPublicSelect,
    });
    return user;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.language ? { language: dto.language } : {}),
        ...(dto.theme ? { theme: dto.theme } : {}),
      },
      select: userPublicSelect,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Eski parol noto\'g\'ri');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async setAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: userPublicSelect,
    });
  }
}
