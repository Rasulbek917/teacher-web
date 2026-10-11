import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class StatGroupQueryDto {
  @IsString()
  groupId: string;

  @IsOptional()
  @IsDateString({}, { message: "Sana formati noto'g'ri" })
  date?: string;
}

export class StatStudentQueryDto {
  @IsString()
  studentId: string;

  @IsString()
  groupId: string;

  @IsOptional()
  @IsIn(['week', 'month'], { message: "unit 'week' yoki 'month' bo'lishi kerak" })
  unit?: string;

  @IsOptional()
  @IsDateString({}, { message: "Sana formati noto'g'ri" })
  date?: string;
}

export class MyStatQueryDto {
  @IsOptional()
  @IsIn(['week', 'month'], { message: "unit 'week' yoki 'month' bo'lishi kerak" })
  unit?: string;

  @IsOptional()
  @IsDateString({}, { message: "Sana formati noto'g'ri" })
  date?: string;

  @IsOptional()
  @IsString()
  groupId?: string;
}
