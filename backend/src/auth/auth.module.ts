import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { LoginAttemptsService } from './login-attempts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { jwtExpiresIn, jwtSecret } from '../common/env.util';

@Module({
  imports: [
    PassportModule,
    // registerAsync: sir faqat ishga tushish paytida (ConfigModule .env ni
    // yuklagach) o'qiladi. Production'da zaif sir bilan ilova ishga tushmaydi.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: jwtExpiresIn() },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LoginAttemptsService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, LoginAttemptsService, JwtModule],
})
export class AuthModule {}
