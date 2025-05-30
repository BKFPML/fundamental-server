import { Test, TestingModule } from '@nestjs/testing';
import { EtherscanService } from './etherscan.service';

describe('EtherscanService', () => {
  let service: EtherscanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EtherscanService],
    }).compile();

    service = module.get<EtherscanService>(EtherscanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
