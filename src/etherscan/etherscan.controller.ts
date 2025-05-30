import { Controller, Get, Param } from '@nestjs/common';
import { EtherscanService } from './etherscan.service';

@Controller('etherscan')
export class EtherscanController {
  constructor(private readonly etherscanService: EtherscanService) {}

  @Get('txs/:address')
  getTransactions(@Param('address') address: string) {
    return this.etherscanService.updateWalletTransactions(address);
  }
}
