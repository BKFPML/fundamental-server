import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';

@Controller('alchemy')
export class AlchemyController {
    constructor(readonly alchemyService: AlchemyService) {}

    @Get('update-token-balances/:address')
    async updateTokenBalancesController(@Param('address') address: string) {
        await this.alchemyService.updateTokenBalances(address);
    }

    @Get('get-token-history/:symbol')
    async getTokenHistoricPricesController(@Param('symbol') symbol: string) {
        await this.alchemyService.getTokenHistoricPrices(symbol);
    }

    @Get('update-token-price/')
    async updateTokenPriceInDollarsController() {
        await this.alchemyService.updateTokenPriceInDollars();
    }
}
