import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
    @Post('get-token-history/:token')
    async getTokenHistory(@Param('token') token: string, @Body() body: { beginDate: string; endDate: string; interval: Number; tokenAddress: string; network: string}): Promise<any> {
        const beginDate = new Date(body.beginDate);
        const endDate = new Date(body.endDate);
        return this.alchemyService.getTokenHistoricPrice(token, beginDate, endDate, body.interval, body.tokenAddress, body.network);
    }
}
