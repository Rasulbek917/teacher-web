import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { IsLogin, IsUzbekPhone } from '../../common/validators/custom.validators';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ism kamida 2 belgi' })
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Familiya kamida 2 belgi' })
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsUzbekPhone()
  phone?: string;

  @IsOptional()
  @IsLogin()
  login?: string;
}
