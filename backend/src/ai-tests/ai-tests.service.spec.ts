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

  it('rejects insufficient material before calling the provider', async () => {
    await expect(service.generateFromMaterial({
      subject: 'English', topic: 'Tenses', questionCount: 5, difficulty: 'EASY',
    }, 'too short'))
      .rejects.toThrow('kamida 80 ta belgidan');
  });
});
