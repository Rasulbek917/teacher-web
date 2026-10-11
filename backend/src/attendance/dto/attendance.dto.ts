import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AttendanceRecordDto {
  @IsString()
  studentId: string;

  @IsBoolean()
  present: boolean;
}

export class SaveAttendanceDto {
  @IsString()
  groupId: string;

  @IsDateString({}, { message: 'Sana noto\'g\'ri' })
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

export class AttendanceQueryDto {
  @IsString()
  groupId: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  homeworkId?: string;
}
