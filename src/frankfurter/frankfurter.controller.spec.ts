import { Test, TestingModule } from '@nestjs/testing';
import { FrankfurterController } from './frankfurter.controller';

describe('FrankfurterController', () => {
  let controller: FrankfurterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FrankfurterController],
    }).compile();

    controller = module.get<FrankfurterController>(FrankfurterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
