import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { log } from 'console';
@Injectable()
export class AlchemyService {
    private readonly apiKey: string;

    constructor(
        private readonly configService: ConfigService
      ) {
        this.apiKey = this.configService.get<string>('ALCHEMY_API_KEY');
      }

    public async getTokenMetadata(contractAddress: string): Promise<any> {

        const network = 'base';
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;

        const data = {
        jsonrpc: '2.0',
        method: 'alchemy_getTokenMetadata',
        params: [contractAddress],
        id: 1,
        };

        try {
        const response = await axios.post(Url, data);
        const metadata = response.data.result;

        if (metadata) {
            return {
            name: metadata.name || 'Nom indisponible',
            symbol: metadata.symbol || 'Symbole indisponible',
            decimals: metadata.decimals || 'Decimales indisponibles',
            };
        } else {
            throw new Error('Token metadata not found');
        }
        } catch (error) {
        Logger.error('Error fetching token metadata:', error);
        throw error;
        }
    }

    public async getTokenBalances(address: string): Promise<any[]> {

        const network = "base"
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;

        const data = {
            jsonrpc: '2.0',
            method: 'alchemy_getTokenBalances',
            params: [address],
            id: 1
        };

        try {
            let response = await axios.post(Url, data);
            let balances = response.data.result.tokenBalances;

            let answer = [];

            for (const balance of balances) {
                // let metadata = await this.getTokenMetadata(balance.contractAddress);
                answer.push({
                    asset: balance.contractAddress,
                    // name: metadata.name,
                    // symbol: metadata.symbol,
                    value: balance.tokenBalance,
                    // decimal: metadata.decimals
                });

            }


            return answer;
        } catch (error) {
            console.error('Error fetching token balances:', error);
            throw error;
        }

    }

    public async getEthBalance(address: string): Promise<string> {
        const network = "base"
        Logger.log(`Fetching balance for address: ${address}`);


        Logger.log(`API Key: ${this.apiKey}`);
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;

        const data = {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1
        };

        try {
            const response = await axios.post(Url, data);
            Logger.log(response.data);
            const weiBalance = response.data.result;
            const ethBalance = parseFloat(weiBalance) / 1e18;
            Logger.log(`Balance for address ${address}: ${weiBalance} WEI`);
            Logger.log(`Balance for address ${address}: ${ethBalance} ETH`);
            return weiBalance;
        } catch (error) {

            Logger.log(error);
            throw error;
        }
    }

    async getTokenPriceInEuro(symbols: string): Promise<any> {
        const symbolsArray = symbols.split('&');
        const results = [];
        for (const symbol of symbolsArray) {
            const Url = `https://api.g.alchemy.com/prices/v2/${this.apiKey}/tokens/by-symbol?${symbol}`;
            try {
                const response = await axios.get(Url);
                Logger.log('Full response for symbol', symbol, response.data);
                const tokenData = response.data.data?.[0];
                if (!tokenData || tokenData.error) {
                    throw new Error(`Error fetching data for symbol ${symbol}: ${tokenData?.error || 'Unknown error'}`);
                }
                const priceInUsd = tokenData.prices.find(price => price.currency === 'usd')?.value;
                if (!priceInUsd) {
                    throw new Error(`Price in USD not found for symbol ${symbol}`);
                }
                const lastUpdated = tokenData.prices.find(price => price.currency === 'usd')?.lastUpdatedAt;
                Logger.log(`Price of ${symbol} in USD: ${priceInUsd}`);
                Logger.log(`Last updated: ${lastUpdated}`);
                results.push({
                    symbol,
                    price: `${priceInUsd} AT ${lastUpdated}`,
                });
            } catch (error) {
                console.error(`Error fetching token price for symbol ${symbol}:`, error);
                results.push({ symbol, error: error.message });
            }
        }
        return results;
    }

    async getTokenHistoricPrice(symbol: string, beginDate: Date, endDate: Date, interval: Number): Promise<any> {
        const formattedBeginDate = beginDate.toISOString();
        const formattedEndDate = endDate.toISOString();
        const url = `https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`;

        try {
            const data = {
                symbol: symbol,
                startTime: formattedBeginDate,
                endTime: formattedEndDate,
                interval: interval,
            };
            const response = await axios.post(url, data);
            const priceArray = response.data.data.map(data => ({
                price: data.value,
                date: data.timestamp,
            }));
            console.log(priceArray, 'prices found');
            return response.data;
        } catch (error) {
            if (error.response) {
                console.error(`API returned an error:`, error.response.data);
            } else if (error.request) {
                console.error(`No response received from API:`, error.request);
            } else {
                console.error(`Error setting up request:`, error.message);
            }
            throw error;
        }
    }
}