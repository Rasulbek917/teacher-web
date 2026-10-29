import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AccessModule } from './common/access/access.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeachersModule } from './teachers/teachers.module';
import { StudentsModule } from './students/students.module';
import { GroupsModule } from './groups/groups.module';
import { MaterialsModule } from './materials/materials.module';
import { HomeworkModule } from './homework/homework.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PaymentsModule } from './payments/payments.module';
import { StatisticsModule } from './statistics/statistics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { FilesModule } from './files/files.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TelegramModule } from './telegram/telegram.module';
import { AiTestsModule } from './ai-tests/ai-tests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Umumiy xavfsizlik to'sig'i (login 5 marta xato -> 5 daqiqa blok AuthService ichida).
    // Bir NAT orqasidagi ko'p foydalanuvchi uchun yetarli bo'lishi kerak.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    TeachersModule,
    StudentsModule,
    GroupsModule,
    MaterialsModule,
    HomeworkModule,
    SubmissionsModule,
    AttendanceModule,
    PaymentsModule,
    StatisticsModule,
    NotificationsModule,
    ChatModule,
    FilesModule,
    DashboardModule,
    TelegramModule,
    AiTestsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
