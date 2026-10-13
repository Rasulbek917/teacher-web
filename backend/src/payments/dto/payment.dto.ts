import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class MarkPaidDto {
  @IsString()
  studentId: string;

  @IsString()
  groupId: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  @IsInt({ message: "Summa butun son bo'lishi kerak" })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString({}, { message: "To'lov sanasi formati noto'g'ri" })
  paidAt?: string;
}

export class UpdatePaymentDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString({}, { message: "To'lov sanasi formati noto'g'ri" })
  paidAt?: string;
}

export class SetPaymentDeadlineDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  // "YYYY-MM-DD" yoki null (muddatni o'chirish uchun).
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}

export class PaymentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  groupId?: string;

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
