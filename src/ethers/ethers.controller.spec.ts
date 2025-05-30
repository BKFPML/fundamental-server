import { Test, TestingModule } from '@nestjs/testing';
import { EthersController } from './ethers.controller';

describe('EthersController', () => {
  let controller: EthersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EthersController],
    }).compile();

    controller = module.get<EthersController>(EthersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
