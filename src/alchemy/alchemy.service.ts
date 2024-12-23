import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { log } from 'console';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class AlchemyService {
    private readonly apiKey: string;
    private readonly supabaseUrl: string;
    private readonly supabaseKey: string;
    public supabase: any;

    constructor(
        private readonly configService: ConfigService
    ) {
        this.apiKey = this.configService.get<string>('ALCHEMY_API_KEY'); // Récupération de la clé API Alchemy
        this.supabaseUrl = this.configService.get<string>('SUPABASE_URL'); // Récupération de l'URL Supabase
        this.supabaseKey = this.configService.get<string>('SUPABASE_KEY'); // Récupération de la clé Supabase
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase
    }

    public async updateTokenBalances(address: string): Promise<any[]> {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;

        const data = {
            jsonrpc: '2.0',
            method: 'alchemy_getTokenBalances',
            params: [address],
            id: 1,
        };

        try {
            // Fetch balances from Alchemy
            const response = await axios.post(url, data);
            const balances = response.data.result.tokenBalances;

            // Fetch accepted tokens and convert them to a Map for efficient lookups
            const { data: acceptedTokens, error } = await this.supabase
                .from('token_list')
                .select("address, digits");

            if (error) throw new Error(`Error fetching accepted tokens: ${error.message}`);

            const tokenMap = new Map(acceptedTokens.map(token => [token.address, token.digits]));

            // Process balances
            const res = balances
                .filter(balance => tokenMap.has(balance.contractAddress)) // Filter only accepted tokens
                .map(balance => {
                    const decimals = tokenMap.get(balance.contractAddress) as number;
                    const tokenBalance = Number(BigInt(balance.tokenBalance)) / Math.pow(10, decimals);

                    return {
                        token_address: balance.contractAddress,
                        balance: tokenBalance,
                    };
                });

            // Update balances in the database
            const { error: updateError } = await this.supabase.from('users').update({ balances: res }).eq('wallet_address', address);

            if (updateError) throw new Error(`Error updating balances: ${updateError.message}`);

            return res;
        } catch (error) {
            Logger.error('Error fetching or processing token balances:', error.message);
            throw error;
        }
    }

    public async getEthBalance(address: string): Promise<string> {

        const network = "base"
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        const data = {
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1
        };

        try {
            const response = await axios.post(Url, data);

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

    async getTokenPriceInEuro(): Promise<any> {
        try {

            // Fetch tokens from the database
            const { data: tokens, error } = await this.supabase
                .from('token_list')
                .select('symbol, value');
            if (error) throw new Error(`Error fetching tokens: ${error.message}`);
            if (!tokens || tokens.length === 0) return [];

            // Prepare the symbols query string
            const symbolsQuery = tokens.map(token => `symbols=${token.symbol}`).join('&');
            const url = `https://api.g.alchemy.com/prices/v2/${this.apiKey}/tokens/by-symbol?${symbolsQuery}`;

            // Fetch token prices
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                },
            });

            const results = response.data.data;

            // Process each token price and update the database
            const updates = results.map(async tokenData => {

                // Find the token in the database by symbol previously fetched
                const token = tokens.find(t => t.symbol === tokenData.symbol);
                if (!token) return null; // Skip if no matching token found

                // Update the token value with new price and timestamp
                const updatedValue = [
                    ...(token.value || []),
                    { value: tokenData.prices[0].value, timestamp: tokenData.prices[0].lastUpdatedAt },
                ];

                // Update the token value in the database
                const { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ value: updatedValue })
                    .eq('symbol', tokenData.symbol);

                if (updateError) {
                    throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                }

                return {
                    price: tokenData.prices[0].value,
                    date: tokenData.prices[0].lastUpdatedAt,
                };
            });

            // Wait for all updates to complete
            return await Promise.all(updates);
        } catch (error) {
            console.error('Error fetching or updating token prices:', error.message);
            throw error;
        }
    }

    async getTokenHistoricPrices(symbol: string = "WETH", startTimes: string="2024-11-21T00:00:00Z", interval: string="1d"): Promise<any> {
        const options = {
            method: 'POST',
            headers: {accept: 'application/json', 'content-type': 'application/json'},
            body: JSON.stringify({
              symbol: symbol,
              startTime: startTimes,
              endTime: new Date().toISOString(),
              interval: interval
            })
          };
          
        fetch(`https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`, options)
            .then(res => res.json())
            .then(async res => {
                const { data: token, error } = await this.supabase.from('token_list').select('name, value').eq('symbol', symbol);
                if (error) {
                    throw new Error(`Error fetching token (${symbol}): ${error.message}`);
                }
                Logger.log(token);
                if (token[0].value === null) {
                    Logger.log("Inserting new token");
                    Logger.log(res.data);
                    Logger.log(symbol);
                    const { error: updateError } = await this.supabase.from('token_list').update({ value: res.data }).eq('symbol', symbol)

                    if (updateError) {
                        throw new Error(`Error updating token (${symbol}): ${updateError.message}`)
                    }
                }
                return res.data;
            })
            .catch(err => Logger.log(err));
        
    }
}
