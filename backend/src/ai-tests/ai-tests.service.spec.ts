import { AiTestsService } from './ai-tests.service';
import { ConfigService } from '@nestjs/config';

describe('AiTestsService', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;
  let service: AiTestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiTestsService(config);
  });

  it('rejects generation when Gemini key is not configured', async () => {
    (config.get as jest.Mock).mockReturnValue(undefined);
    await expect(service.generateFromMaterial({
      subject: 'English', topic: 'Tenses', questionCount: 5, difficulty: 'EASY',
    }, 'This is a sufficiently long study material used for testing validation. '.repeat(2)))
      .rejects.toThrow('AI xizmati sozlanmagan');
  });

  it('validates and returns a generated multiple-choice draft', async () => {
    (config.get as jest.Mock).mockReturnValue('test-key');
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [{ question: '2 + 2?', options: ['1', '2', '4', '5'], correctAnswer: 2, explanation: 'Oddiy arifmetika.' }] }) }] }] }),
    }) as unknown as typeof fetch;
    try {
      const result = await service.generateFromMaterial({ subject: 'Matematika', topic: 'Qo‘shish', questionCount: 1, difficulty: 'EASY' }, 'Yetarli uzunlikdagi dars materiali uchun matn. '.repeat(3));
      expect(result.generatedCount).toBe(1);
      expect(result.questions[0].correctAnswer).toBe(2);
      expect(result.requiresTeacherReview).toBe(true);
    } finally { global.fetch = originalFetch; }
  });

  it('rejects insufficient material before calling the provider', async () => {
    await expect(service.generateFromMaterial({
      subject: 'English', topic: 'Tenses', questionCount: 5, difficulty: 'EASY',
    }, 'too short'))
      .rejects.toThrow('kamida 80 ta belgidan');
  });
});
