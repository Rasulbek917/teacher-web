import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController, StudentGroupsController } from './groups.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [GroupsController, StudentGroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
