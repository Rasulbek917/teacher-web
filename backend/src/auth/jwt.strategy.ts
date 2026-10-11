import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { jwtSecret } from '../common/env.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // jwtSecret() ishga tushish paytida o'qiydi (ConfigModule .env yuklagach)
      // va production'da zaif sirni rad etadi.
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: {
    sub: string;
    role: Role;
    login: string;
    tv?: number;
  }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        login: true,
        firstName: true,
        lastName: true,
        isBlocked: true,
        tokenVersion: true,
      },
    });
    if (!user) throw new UnauthorizedException('Avtorizatsiya talab qilinadi');
    if (user.isBlocked) {
      throw new UnauthorizedException(
        'Hisobingiz bloklangan, o\'qituvchingizga murojaat qiling',
      );
    }
    // Parol o'zgargan bo'lsa (tokenVersion oshgan) eski tokenlar kuchini yo'qotadi.
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Sessiya eskirgan, qayta kiring');
    }
    return {
      id: user.id,
      role: user.role,
      login: user.login,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
