import { Handler } from '@netlify/functions';
import { EtherscanService } from '../../../src/etherscan/etherscan.service';
import { ConfigService } from '@nestjs/config';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const ethersService = new EtherscanService(new ConfigService());

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
    const status = await ethersService.updateWalletTransactions(address);

    // Retourner les données récupérées au format JSON
    return {
        statusCode: status.exitCode,
        body: JSON.stringify({ "message": status.message }),
    };
};