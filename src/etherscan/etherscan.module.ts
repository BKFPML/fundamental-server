import { Module } from '@nestjs/common';
import { EtherscanService } from './etherscan.service';
import { EtherscanController } from './etherscan.controller';

@Module({
  providers: [EtherscanService],
  controllers: [EtherscanController]
})
export class EtherscanModule {}
