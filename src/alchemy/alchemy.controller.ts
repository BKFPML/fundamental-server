import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
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

    @Get('token-price-in-euro/:token')
    async getTokenPriceInEuro(): Promise<any> {
        return this.alchemyService.getTokenPriceInEuro();
    }

    @Post('get-token-history/:token')
    async getTokenHistory(@Param('tokenAdress') tokenAddress: string): Promise<any> {
        let start_time = ['2024-11-21T00:00:00Z', '2024-12-21T00:00:00Z'];
        let interval = '1d';
        return this.alchemyService.getTokenHistoricPrices(tokenAddress, start_time, interval);
    }
}
