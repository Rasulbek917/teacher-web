import { IsEnum, IsOptional } from 'class-validator';
import { Language, Theme } from '@prisma/client';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;
}
