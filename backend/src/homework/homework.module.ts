import { Module } from '@nestjs/common';
import {
  HomeworkController,
  StudentHomeworkController,
} from './homework.controller';
import { HomeworkService } from './homework.service';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [FilesModule, NotificationsModule],
  controllers: [HomeworkController, StudentHomeworkController],
  providers: [HomeworkService],
  exports: [HomeworkService],
})
export class HomeworkModule {}
