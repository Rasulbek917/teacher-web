import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Barcha sahifalangan ro'yxatlar uchun umumiy query parametrlari.
 * `whitelist: true` bilan ishlaydi — shuning uchun har bir maydon
 * DTO'da aniq e'lon qilinishi shart, aks holda o'chirib tashlanadi.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
