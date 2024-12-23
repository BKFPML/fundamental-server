import { Handler } from '@netlify/functions';
import { AlchemyService } from '../../../src/alchemy/alchemy.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const alchemyService = new AlchemyService(new ConfigService());

export const handler: Handler = async (event) => {
    const symbol = event.path.split('/').pop();
    if (!symbol) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Address not provided' }),
        };
    }
    const data = await alchemyService.getTokenHistoricPrices(symbol);
    if (!data) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Balance not found' }),
        };
    }
    return {
        statusCode: 200,
        body: JSON.stringify({ data }),
    };
};
