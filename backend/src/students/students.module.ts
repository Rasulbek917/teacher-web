import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { FilesModule } from '../files/files.module';
import { ChatModule } from '../chat/chat.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [FilesModule, ChatModule, TelegramModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
