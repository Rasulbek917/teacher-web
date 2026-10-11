import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsLogin, IsUzbekPhone } from '../../common/validators/custom.validators';

export class MembershipDto {
  @IsString()
  groupId: string;

  @IsOptional()
  @IsInt({ message: "Alohida narx butun son bo'lishi kerak" })
  @Min(0)
  customPrice?: number;
}

export class CreateStudentDto {
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

  @IsUzbekPhone()
  parentPhone: string;

  @IsLogin()
  login: string;

  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgi bo'lishi kerak" })
  @MaxLength(100)
  password: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta guruh tanlang' })
  @ValidateNested({ each: true })
  @Type(() => MembershipDto)
  memberships: MembershipDto[];
}

export class UpdateStudentDto {
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
  @IsUzbekPhone()
  parentPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Kamida bitta guruh tanlang" })
  @ValidateNested({ each: true })
  @Type(() => MembershipDto)
  memberships?: MembershipDto[];
}

export class SetStudentBlockedDto {
  @IsBoolean()
  isBlocked: boolean;
}

export class SetStudentPasswordDto {
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgi bo'lishi kerak" })
  @MaxLength(100)
  newPassword: string;
}
