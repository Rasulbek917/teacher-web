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

  // Oldindan bo'laklab yuklangan biriktirma URL'lari (JSON massiv). Fayllar
  // avval POST /api/files/upload orqali yuklanadi, so'ng URL'lar shu yerda beriladi.
  @IsOptional()
  @IsString()
  attachmentUrls?: string;
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

  // Yangi biriktirmalar (bo'laklab yuklangan fayllar URL'lari, JSON massiv)
  @IsOptional()
  @IsString()
  attachmentUrls?: string;
}

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;

  // Bo'laklab yuklangan javob fayli URL'i (ixtiyoriy)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;
}

/** Uy vazifalari ro'yxati uchun filtr (sahifalash + guruh). */
export class HomeworkQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  groupId?: string;
}
