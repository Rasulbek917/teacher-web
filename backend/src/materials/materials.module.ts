import { Module } from '@nestjs/common';
import {
  MaterialsController,
  StudentMaterialsController,
} from './materials.controller';
import { MaterialsService } from './materials.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [MaterialsController, StudentMaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
