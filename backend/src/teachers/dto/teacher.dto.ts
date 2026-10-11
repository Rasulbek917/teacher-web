import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { IsLogin, IsUzbekPhone } from '../../common/validators/custom.validators';

export class CreateTeacherDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsUzbekPhone()
  phone: string;

  @IsLogin()
  login: string;

  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgi bo'lishi kerak" })
  @MaxLength(100)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  centerName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city: string;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsUzbekPhone()
  phone?: string;

  @IsOptional()
  @IsLogin()
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgi bo'lishi kerak" })
  @MaxLength(100)
  newPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  centerName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city?: string;
}

export class DeleteTeacherDto {
  @IsString({ message: 'Tasdiqlash uchun login yozing' })
  login: string;
}
