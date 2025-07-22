import { Handler } from '@netlify/functions';
import { AlchemyService } from '../../../src/alchemy/alchemy.service';
import { ConfigService } from '@nestjs/config';

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

    const status = await alchemyService.getTokenHistoricPrices(symbol);
    
    return {
        statusCode: status.exitCode,
        body: JSON.stringify({ message: status.message }),
    };
};
