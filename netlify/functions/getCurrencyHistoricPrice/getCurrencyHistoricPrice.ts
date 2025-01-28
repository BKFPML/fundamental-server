import { Handler } from '@netlify/functions';
import { AlchemyService } from '../../../src/alchemy/alchemy.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const alchemyService = new AlchemyService(new ConfigService());

export const handler: Handler = async (event) => {
    // Appel de la méthode getCurrenciesPrice de AlchemyService pour récupérer les données des currencies
    const symbol = event.path.split('/').pop();

    if (!symbol) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Currencies not provided' }),
        };
    }

    await alchemyService.getCurrenciesHistoricPrice(symbol);

    return {
        statusCode: 200,
        body: JSON.stringify({ "message": "Currencies prices updated successfully" }),
    };
};
