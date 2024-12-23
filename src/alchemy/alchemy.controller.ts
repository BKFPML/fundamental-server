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

    @Get('get-token-history')
    async getTokenHistoricPrices(@Body() body: {symbol: string, start_times: string, interval: string}) {
        
        return this.alchemyService.getTokenHistoricPrices(body.symbol, body.start_times, body.interval);
    }
}
