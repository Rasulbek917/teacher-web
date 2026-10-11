import { IsString, MinLength, MaxLength } from 'class-validator';
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

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
          return "Yangi parollar mos kelmadi";
        },
      },
    });
  };
}

export class ChangePasswordDto {
  @IsString({ message: 'Eski parol majburiy' })
  oldPassword: string;

  @IsString()
  @MinLength(6, { message: "Yangi parol kamida 6 belgi bo'lishi kerak" })
  @MaxLength(100)
  newPassword: string;

  @IsString()
  @Match('newPassword', { message: 'Yangi parollar mos kelmadi' })
  confirmPassword: string;
}
