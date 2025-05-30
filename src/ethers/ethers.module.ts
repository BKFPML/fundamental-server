import { Module } from '@nestjs/common';
import { EthersController } from './ethers.controller';
import { EthersService } from './ethers.service';

@Module({
  controllers: [EthersController],
  providers: [EthersService]
})
export class EthersModule {}
