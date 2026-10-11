import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const PHONE_RE = /^\+998 \d{2} \d{3} \d{2} \d{2}$/;
const LOGIN_RE = /^[A-Za-z0-9_]{4,}$/;

export function IsUzbekPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUzbekPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && PHONE_RE.test(value.trim());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} formati noto'g'ri (+998 XX XXX XX XX bo'lishi kerak)`;
        },
      },
    });
  };
}

export function IsLogin(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLogin',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && LOGIN_RE.test(value.trim());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} faqat lotin harf, raqam va pastki chiziqdan iborat bo'lib, kamida 4 belgi bo'lishi kerak`;
        },
      },
    });
  };
}
