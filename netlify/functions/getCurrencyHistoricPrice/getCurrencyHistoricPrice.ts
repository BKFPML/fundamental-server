import { Handler } from '@netlify/functions';
import { FrankfurterService } from '../../../src/frankfurter/frankfurter.service';
import { ConfigService } from '@nestjs/config';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const frankfurterService = new FrankfurterService(new ConfigService());

export const handler: Handler = async (event) => {
    // Appel de la méthode getCurrenciesPrice de AlchemyService pour récupérer les données des currencies
    const symbol = event.path.split('/').pop();

    if (!symbol) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Currencies not provided' }),
        };
    }

    await frankfurterService.getCurrenciesHistoricPrice(symbol);

    return {
        statusCode: 200,
        body: JSON.stringify({ "message": "Currencies prices updated successfully" }),
    };
};
