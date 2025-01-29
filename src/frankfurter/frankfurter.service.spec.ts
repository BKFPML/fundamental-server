import { Test, TestingModule } from '@nestjs/testing';
import { FrankfurterService } from './frankfurter.service';

describe('FrankfurterService', () => {
  let service: FrankfurterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FrankfurterService],
    }).compile();

    service = module.get<FrankfurterService>(FrankfurterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
