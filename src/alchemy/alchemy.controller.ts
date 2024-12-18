import { Body, Controller, Get, Param } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';

@Controller('alchemy')
export class AlchemyController {
    constructor(readonly alchemyService: AlchemyService) {}

    @Get('eth-balance/:address')
    async getEthBalance(@Param('address') address: string): Promise<string> {
        return this.alchemyService.getEthBalance(address);
    }
    @Get('token-price-in-euro/:token')
    async getTokenPriceInEuro(@Param('token') token: string): Promise<any> {
        return this.alchemyService.getTokenPriceInEuro(token);
    }
    @Get('get-token-history/:token')
    async getTokenHistory(@Param('token') token: string, @Param('beginDate') beginDate: Date, @Param('endDate') endDate: Date): Promise<any> {
        return this.alchemyService.getTokenHistoricPrice(token, beginDate, endDate);
    }
}
