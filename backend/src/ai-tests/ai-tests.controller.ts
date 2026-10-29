import { BadRequestException, Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AiTestsService } from './ai-tests.service';
import { GenerateTestDto } from './dto/generate-test.dto';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Roles(Role.TEACHER)
@Controller('ai-tests')
export class AiTestsController {
  constructor(private readonly aiTests: AiTestsService) {}

  @Post('generate')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (ALLOWED_MIME.has(file.mimetype)) return callback(null, true);
      callback(new BadRequestException('Faqat PDF yoki DOCX formatidagi fayl yuklash mumkin.'), false);
    },
  }))
  async generate(@Body() dto: GenerateTestDto, @UploadedFile() file?: Express.Multer.File) {
    let extractedText = '';
    if (file) {
      if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Fayl hajmi 8 MB dan oshmasligi kerak.');
      if (file.mimetype === 'application/pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(file.buffer);
        extractedText = parsed.text || '';
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const mammoth = await import('mammoth');
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = parsed.value || '';
      }
    }
    return this.aiTests.generateFromMaterial(dto, extractedText);
  }
}
