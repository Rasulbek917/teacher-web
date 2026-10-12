import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MaterialType, VideoSource } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateMaterialDto {
  @IsString()
  groupId: string;

  @IsString()
  @MinLength(1, { message: 'Sarlavha majburiy' })
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(MaterialType)
  type: MaterialType;

  @IsOptional()
  @IsEnum(VideoSource)
  videoSource?: VideoSource;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  // Bo'laklab yuklangan video URL'i (VIDEO/UPLOAD uchun)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  // Bo'laklab yuklangan rasmlar URL'lari (IMAGE uchun, JSON massiv)
  @IsOptional()
  @IsString()
  imageUrls?: string;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  // Bo'laklab yuklangan video URL'i (VIDEO/UPLOAD uchun)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  // Bo'laklab yuklangan rasmlar URL'lari (IMAGE uchun, JSON massiv)
  @IsOptional()
  @IsString()
  imageUrls?: string;
}

/** Materiallar ro'yxati uchun filtr (sahifalash + tur + guruh). */
export class MaterialsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsEnum(MaterialType, { message: "Material turi noto'g'ri" })
  type?: MaterialType;
}

/** Materialdan bitta rasmni o'chirish uchun body. */
export class RemoveImageDto {
  @IsString()
  url: string;
}
