import { Controller, Get, Param } from '@nestjs/common';
import { FrankfurterService } from './frankfurter.service';

@Controller('frankfurter')
export class FrankfurterController {

    constructor(readonly alchemyService: FrankfurterService) {}

    @Get('get-currencies-history/:currency')
    async getCurrenciesHistoricPriceController(@Param('currency') currency: string): Promise<void> {
        await this.alchemyService.getCurrenciesHistoricPrice(currency);
    }

    @Get('update-currency-price/')
    async updateCurrencyPriceController(): Promise<void> {
        await this.alchemyService.updateCurrencyPrice();
    }
}
