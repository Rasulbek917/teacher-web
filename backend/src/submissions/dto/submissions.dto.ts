import { IsString } from 'class-validator';

/** O'quvchi topshiriqlarini olish uchun query (guruh majburiy). */
export class StudentHomeworksQueryDto {
  @IsString()
  groupId: string;
}
