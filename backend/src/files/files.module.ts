import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { jwtExpiresIn, jwtSecret } from '../common/env.util';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: jwtExpiresIn() },
      }),
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
