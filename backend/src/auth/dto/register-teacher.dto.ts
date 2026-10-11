import {
  IsString,
  MinLength,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { IsLogin, IsUzbekPhone } from '../../common/validators/custom.validators';

function Match(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [related] = args.constraints;
          return value === (args.object as any)[related];
        },
        defaultMessage() {
          return "Parollar mos kelmadi";
        },
      },
    });
  };
}

export class RegisterTeacherDto {
  @IsString()
  @MinLength(2, { message: 'Ism kamida 2 belgi' })
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Familiya kamida 2 belgi' })
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
  @Match('password', { message: 'Parollar mos kelmadi' })
  confirmPassword: string;

  @IsString()
  @MinLength(2, { message: "O'quv markazi nomi majburiy" })
  @MaxLength(100)
  centerName: string;

  @IsString()
  @MinLength(2, { message: 'Shahar majburiy' })
  @MaxLength(60)
  city: string;
}
