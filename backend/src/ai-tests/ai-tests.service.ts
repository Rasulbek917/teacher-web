import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateTestDto } from './dto/generate-test.dto';

export interface GeneratedQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

@Injectable()
export class AiTestsService {
  constructor(private readonly config: ConfigService) {}

  async generate(dto: GenerateTestDto, materialText: string, document?: { mimeType: string; data: string }) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('AI xizmati sozlanmagan. GEMINI_API_KEY ni backend environment ga kiriting.');

    const prompt = [
      'You are a careful educational assessment author.',
      'Create multiple-choice questions ONLY from the supplied study material. Do not invent unsupported facts.',
      'Return only valid JSON with shape: {"questions":[{"question":"...","options":["A","B","C","D"],"correctAnswer":0,"explanation":"..."}]}.',
      'correctAnswer is a zero-based integer from 0 to 3. Every question must have exactly four options and exactly one correct answer.',
      'Write the questions, options and explanations in Uzbek Latin unless the supplied material clearly requires another language.',
      'If the material is insufficient, create only questions supported by it; never fabricate details.',
      `Subject: ${dto.subject}`,
      `Topic: ${dto.topic}`,
      `Difficulty: ${dto.difficulty}`,
      `Requested question count: ${dto.questionCount}`,
      'Study material:',
      materialText.slice(0, 45000),
    ].join('\n\n');

    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...(document ? [{ inlineData: { mimeType: document.mimeType, data: document.data } }] : [])] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw new ServiceUnavailableException('Gemini xizmatiga ulanib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
    }
    if (!response.ok) {
      // Do not return provider body: it may contain request metadata.
      if (response.status === 429) throw new ServiceUnavailableException('AI so‘rovlari limiti tugadi. Birozdan keyin urinib ko‘ring.');
      throw new ServiceUnavailableException('AI test yaratishda xatolik yuz berdi.');
    }

    const payload = await response.json() as any;
    const raw = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('');
    if (typeof raw !== 'string' || !raw.trim()) throw new ServiceUnavailableException('AI bo‘sh javob qaytardi.');
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException('AI javobini o‘qib bo‘lmadi. Qayta urinib ko‘ring.');
    }
    if (!Array.isArray(parsed.questions)) throw new ServiceUnavailableException('AI javobi test formatiga mos emas.');

    const questions: GeneratedQuestion[] = parsed.questions.slice(0, dto.questionCount).map((q: any) => ({
      question: String(q.question || '').trim(),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map((x: any) => String(x).trim()) : [],
      correctAnswer: Number(q.correctAnswer),
      explanation: String(q.explanation || '').trim(),
    })).filter((q: GeneratedQuestion) =>
      q.question.length > 0 &&
      q.options.length === 4 &&
      q.options.every((option) => option.length > 0) &&
      Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer <= 3,
    );

    if (!questions.length) throw new ServiceUnavailableException('Tekshirishdan o‘tadigan savollar yaratilmagan. Materialni to‘ldirib qayta urinib ko‘ring.');
    return { subject: dto.subject, topic: dto.topic, difficulty: dto.difficulty, questions, generatedCount: questions.length, requiresTeacherReview: true };
  }

  async generateFromMaterial(dto: GenerateTestDto, extractedText: string, document?: { mimeType: string; data: string }) {
    const material = [dto.materialText?.trim(), extractedText.trim()].filter(Boolean).join('\n\n');
    if (material.length < 80 && !document) throw new BadRequestException('Test yaratish uchun kamida 80 ta belgidan iborat dars materiali kiriting.');
    return this.generate(dto, material || 'Savollarni biriktirilgan dars hujjati asosida yarating.', document);
  }
}
