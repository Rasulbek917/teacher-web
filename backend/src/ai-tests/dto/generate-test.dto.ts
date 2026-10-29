import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateTestDto {
  @IsString()
  @MaxLength(160)
  subject: string;

  @IsString()
  @MaxLength(240)
  topic: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  questionCount: number;

  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  materialText?: string;
}
