import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { RealtimeGateway } from './realtime.gateway';
import { FilesModule } from '../files/files.module';
import { jwtExpiresIn, jwtSecret } from '../common/env.util';

@Module({
  imports: [
    FilesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: jwtExpiresIn() },
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, RealtimeGateway],
  exports: [ChatService, RealtimeGateway],
})
export class ChatModule {}
