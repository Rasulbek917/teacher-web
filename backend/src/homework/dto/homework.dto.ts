import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateHomeworkDto {
  @IsString()
  groupId: string;

  @IsString()
  @MinLength(1, { message: 'Sarlavha majburiy' })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  // Topshirish muddati ixtiyoriy — matn bilan ham vazifa berish mumkin
  @IsOptional()
  @ValidateIf((o) => o.dueAt !== '')
  @IsDateString({}, { message: 'Topshirish muddati noto\'g\'ri' })
  dueAt?: string;
}

export class UpdateHomeworkDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @ValidateIf((o) => o.dueAt !== '')
  @IsDateString()
  dueAt?: string;

  // Qaysi mavjud biriktirmalar qoldirilishini bildiruvchi JSON massiv (URL'lar)
  @IsOptional()
  @IsString()
  keepAttachmentUrls?: string;
}

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;
}

/** Uy vazifalari ro'yxati uchun filtr (sahifalash + guruh). */
export class HomeworkQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  groupId?: string;
}
