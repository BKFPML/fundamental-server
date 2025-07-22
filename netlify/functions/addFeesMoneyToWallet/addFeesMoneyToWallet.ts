import { Handler } from '@netlify/functions';
import { EthersService } from '../../../src/ethers/ethers.service';
import { ConfigService } from '@nestjs/config';

// Création d'une instance de AlchemyService avec ConfigService comme paramètre
const ethersService = new EthersService(new ConfigService());

export const handler: Handler = async (event) => {
    // Appel de la méthode getCurrenciesPrice de AlchemyService pour récupérer les données des currencies
    const address = event.path.split('/').pop();

    if (!address) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'address not provided' }),
        };
    }

    const status = await ethersService.addFeesMoneyToWallet(address);

    return {
        statusCode: status.exitCode,
        body: JSON.stringify({ "message": status.message }),
    };
};
