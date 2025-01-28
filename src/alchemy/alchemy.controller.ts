import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';

@Controller('alchemy')
export class AlchemyController {
    constructor(readonly alchemyService: AlchemyService) {}

    @Get('update-token-balances/:address')
    async updateTokenBalancesController(@Param('address') address: string): Promise<any> {
        return this.alchemyService.updateTokenBalances(address);
    }

    @Get('get-token-history/:symbol')
    async getTokenHistoricPricesController(@Param('symbol') symbol: string): Promise<void> {
        return this.alchemyService.getTokenHistoricPrices(symbol);
    }

    @Get('update-token-price/')
    async updateTokenPriceInDollarsController() {
        return this.alchemyService.updateTokenPriceInDollars();
    }

    @Get('get-currencies-history/:currency')
    async getCurrenciesHistoricPriceController(@Param('currency') currency: string): Promise<void> {
        return this.alchemyService.getCurrenciesHistoricPrice(currency);
    }

    @Get('update-currency-price/')
    async updateCurrencyPriceController(): Promise<void> {
        return this.alchemyService.updateCurrencyPrice();
    }
}
