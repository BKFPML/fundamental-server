import { Handler } from '@netlify/functions';
import { AlchemyService } from '../../../src/alchemy/alchemy.service';
import { ConfigService } from '@nestjs/config';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const alchemyService = new AlchemyService(new ConfigService());

export const handler: Handler = async (event) => {
    // Récupération de l'adresse dans l'URL de la requête HTTP
    const address = event.path.split('/').pop();
    if (!address) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Address not provided' }),
        };
    }
    // Appel de la méthode updateTokenBalances de AlchemyService pour récupérer les données de l'adresse fournie
    const data = await alchemyService.updateTokenBalances(address);
    if (!data) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Balance not found' }),
        };
    }
    // Retourner les données récupérées au format JSON
    return {
        statusCode: 200,
        body: JSON.stringify({ data }),
    };
};