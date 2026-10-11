import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { assertProductionEnv } from './common/env.util';
import { AppValidationPipe } from './common/app-validation.pipe';

async function bootstrap() {
  // Production'da majburiy sirlar to'g'riligini ishga tushishdan oldin tekshiramiz.
  assertProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');

  // Caddy/nginx orqasida ishlaydi: @Ip() va Throttler haqiqiy mijoz IP sini
  // (X-Forwarded-For) ko'rishi uchun ishonchli proksini belgilaymiz.
  app.set('trust proxy', 1);

  // DIQQAT: uploads papkasi statik ko'rsatilmaydi. Fayllar faqat
  // FilesController (avtorizatsiya + egalik tekshiruvi) orqali olinadi.

  app.useGlobalPipes(
    new AppValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Backend ishga tushdi: http://0.0.0.0:${port}/api`);
}
bootstrap();
