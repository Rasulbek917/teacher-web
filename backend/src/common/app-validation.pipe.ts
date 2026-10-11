import {
  ArgumentMetadata,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Global ValidationPipe kengaytmasi.
 *
 * Nega kerak: `@IsOptional()` FAQAT `null`/`undefined` qiymatlarni o'tkazib
 * yuboradi. Bo'sh satr esa qiymat hisoblanadi va format validatsiyasidan
 * (`@IsEnum`, `@IsDateString`, `@IsInt`) o'tolmay 400 beradi. Masalan,
 * o'qituvchi "Materiallar" sahifasida tur filtri "Barchasi" bo'lganda
 * `?type=` yuborilardi va sahifa xato ko'rsatardi.
 *
 * Yechim: query parametrlaridagi bo'sh satrlarni validatsiyadan oldin olib
 * tashlaymiz (query'da bo'sh qiymat = "berilmagan" degani).
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  async transform(value: any, metadata: ArgumentMetadata): Promise<any> {
    if (
      metadata.type === 'query' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const key of Object.keys(value)) {
        if (value[key] === '') delete value[key];
      }
    }
    return super.transform(value, metadata);
  }
}
