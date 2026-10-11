import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { IsLogin } from '../../common/validators/custom.validators';

export class LoginDto {
  @IsLogin()
  login: string;

  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgi bo'lishi kerak" })
  password: string;
}
