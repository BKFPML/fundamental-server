import { Body, Controller, Get, Param } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';

@Controller('alchemy')
export class AlchemyController {
    constructor(readonly alchemyService: AlchemyService) {}

    @Get('eth-balance/:address')
    async getEthBalance(@Param('address') address: string): Promise<string> {
        return this.alchemyService.getEthBalance(address);
    }

    @Get('token-balances/:address')
    async updateTokenBalances(@Param('address') address: string): Promise<any[]> {
        return this.alchemyService.updateTokenBalances(address);
    }
}
