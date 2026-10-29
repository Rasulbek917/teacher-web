import { BadRequestException, Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { inflateRawSync } from 'node:zlib';
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
    let document: { mimeType: string; data: string } | undefined;
    if (file) {
      if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Fayl hajmi 8 MB dan oshmasligi kerak.');
      if (file.mimetype === 'application/pdf') {
        // Gemini accepts PDF as inline document data; keep file processing in the backend.
        document = { mimeType: file.mimetype, data: file.buffer.toString('base64') };
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        extractedText = this.extractDocxText(file.buffer);
      }
    }
    return this.aiTests.generateFromMaterial(dto, extractedText, document);
  }

  /** Minimal DOCX text extraction using ZIP local-file records and the built-in zlib. */
  private extractDocxText(buffer: Buffer): string {
    const entryName = 'word/document.xml';
    let offset = 0;
    while (offset + 30 < buffer.length) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== 0x04034b50) { offset += 1; continue; }
      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
      const dataStart = nameStart + nameLength + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > buffer.length) break;
      if (name === entryName) {
        const compressed = buffer.subarray(dataStart, dataEnd);
        const xml = (method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : Buffer.alloc(0)).toString('utf8');
        return xml.replace(/<w:tab\\b[^>]*\\/>/g, '\\t').replace(/<w:br\\b[^>]*\\/>/g, '\\n').replace(/<\\/w:p>/g, '\\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&apos;/g, "'").replace(/[ \\t]+/g, ' ').trim();
      }
      offset = dataEnd;
    }
    throw new BadRequestException('DOCX faylidan matnni o‘qib bo‘lmadi. Fayl buzilmaganini tekshiring.');
  }
}
