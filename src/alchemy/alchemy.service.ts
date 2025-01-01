import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { log } from 'console';
import { createClient } from '@supabase/supabase-js';
import { interval } from 'rxjs';
import { start } from 'repl';

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

                const currentTime = new Date();
                Logger.log(`Current time: ${currentTime}`);
                Logger.log("Token value before slice:");
                Logger.log(token);
                if (new Date(token.value[0].timestamp).getTime() < new Date(currentTime.getTime() - 364 * 24 * 60 * 60 * 1000).getTime()) {
                    // If the last data point is older than 364 days
                    token.value = token.value.slice(1); // No need to slice since we keep all data points
                } else if (currentTime.getUTCHours() % 24 === 0) {
                    // If the current hour is a multiple of 24 (midnight)
                    token.value = [...token.value.slice(0, 50), ...token.value.slice(51)];
                } else if (currentTime.getUTCHours() % 6 === 0) {
                    // If the current hour is a multiple of 6
                    token.value = [...token.value.slice(0, 70), ...token.value.slice(71)];
                } else {
                    // Remove the data point from 24 hours ago to keep data up-to-date
                    token.value = [...token.value.slice(0, 95), ...token.value.slice(96)];
                }
                
                Logger.log("Token value after slice:");
                Logger.log(token);
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
                    value: tokenData.prices[0].value,
                    timestamp: tokenData.prices[0].lastUpdatedAt,
                };
            });

            // Wait for all updates to complete
            return await Promise.all(updates);
        } catch (error) {
            console.error('Error fetching or updating token prices:', error.message);
            throw error;
        }
    }

    async getTokenHistoricPrices(symbol: string = "WETH"): Promise<any> {
        let result: { value: string; timestamp: string }[] = [];
        const seen = new Set<string>();
    
        const currentTime = new Date();
        const intervals = [
            { interval: "1d", startTime: new Date(currentTime.getTime() - 364 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 7 }, // 364 days of daily data with 7 day step because of API limits only daily data is available not 7d interval
            { interval: "1d", startTime: new Date(currentTime.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 1 },
            { interval: "1h", startTime: new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 6 }, // 7 days of hourly data with 6 hour step because of API limits only hourly data is available not 6h interval
            { interval: "1h", startTime: new Date(currentTime.getTime() - 24 * 60 * 60 * 1000).toISOString(), data_keep: 1 },
        ];
    
        for (const i of intervals) {

            const options = {
                method: 'POST',
                headers: { accept: 'application/json', 'content-type': 'application/json' },
                body: JSON.stringify({
                    symbol: symbol,
                    startTime: i.startTime,
                    endTime: currentTime.toISOString(),
                    interval: i.interval,
                }),
            };
    
            await fetch(`https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`, options)
                .then((res) => res.json())
                .then((res) => {
                    if (res.data) {
                        let filteredData = res.data;

                        if (i.data_keep === 6) { 
                            filteredData = res.data.filter((_item: any, index: number) =>new Date(res.data[index].timestamp).getUTCHours() % i.data_keep === 0);
                        } else {
                            filteredData = res.data.filter((_item: any, index: number) => index % i.data_keep === 0);
                        }

                        filteredData.forEach((item: { value: string; timestamp: string }) => { // loop through the data and only keep the first data point of each hour
                            const identifier = `${item.timestamp.slice(0, 13)}`; // only keep the first 13 characters of the timestamp aka the date and hour
                            if (!seen.has(identifier)) {
                                seen.add(identifier);
                                result.push(item);
                            }
                        });
                    }
                })
                .catch((err) => {throw new Error(`Error fetching token history (${symbol}): ${err.message}`)});
        }
    
        result.sort((a, b) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(); // sort by timestamp
        });
    
        const { error: updateError } = await this.supabase.from('token_list').update({ value: result }).eq('symbol', symbol); // Update the token value in the database
    
        if (updateError) {
            throw new Error(`Error updating token (${symbol}): ${updateError.message}`);
        }
    
        return result;
    }
}    