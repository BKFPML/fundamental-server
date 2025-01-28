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

    /*

                Utility Functions

    */

    async delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /*

                Token APi Calls

    */

    async getTokenHistoricPrices(symbol: string = "WETH") {
        const currentTime = new Date();
        const intervals = [
            { name: "yearly_value", interval: "1d", startTime: new Date(currentTime.getTime() - 364 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 3 }, // 364 / 3 = 121 value
            { name: "monthly_value", interval: "1h", startTime: new Date(currentTime.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 6 }, // 1 * 24 * 30 / 6 = 120 value
            { name: "weekly_value", interval: "1h", startTime: new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 1 }, // 1 * 24 * 7 = 168 value
            { name: "daily_value", interval: "5m", startTime: new Date(currentTime.getTime() - 24 * 60 * 60 * 1000).toISOString(), data_keep: 2 },
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
    
            Logger.log('Request sent to Alchemy:', options);
    
            await fetch(`https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`, options)
                .then(async (res) => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(`API Error: ${res.status} ${errorText}`);
                    }
                    return res.json();
                })
                .then(async (res) => {
                    if (res.data) {
                        const data = res.data.filter((_, index) => index % i.data_keep === 0);
    
                        const symbolsToUpdate = symbol === "WETH" ? ["WETH", "ETH"] : [symbol];
                        for (const sym of symbolsToUpdate) {
                            const { error: updateError } = await this.supabase
                                .from('token_list')
                                .update({ [i.name]: data })
                                .eq('symbol', sym);
    
                            if (updateError) {
                                throw new Error(`Error updating token (${sym}): ${updateError.message}`);
                            }
                        }
                    } else {
                        throw new Error(`API returned no data for symbol: ${symbol}`);
                    }
                })
                .catch((err) => {
                    throw new Error(`Error fetching token history (${symbol}): ${err.message}`);
                });
            await this.delay(5000);
        }
    }

    public async updateTokenPriceInDollars() {
        try {

            // Fetch tokens from the database
            const { data: tokens, error } = await this.supabase
                .from('token_list')
                .select('symbol, daily_value, weekly_value, monthly_value, yearly_value');
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
                tokenData.prices = tokenData.prices.map((price: any) => ({
                    value: price.value,
                    timestamp: price.lastUpdatedAt
                }));
                // Find the token in the database by symbol previously fetched
                const token = tokens.find(t => t.symbol === tokenData.symbol);
                if (!token) return null; // Skip if no matching token found

                const currentTime = new Date();
                const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));

                if (dayOfYear % 3 && currentTime.getUTCHours() === 0 && currentTime.getUTCMinutes() === 0) {
                    const { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ yearly_value: token.yearly_value.slice(1).concat(tokenData.prices) })
                    .eq('symbol', tokenData.symbol);

                    if (updateError) {
                        throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                    }
                }

                if (currentTime.getUTCHours() % 6 === 0 && currentTime.getUTCMinutes() === 0) {

                    const { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ monthly_value: token.monthly_value.slice(1).concat(tokenData.prices) })
                    .eq('symbol', tokenData.symbol);

                    if (updateError) {
                        throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                    }
                }

                if (currentTime.getUTCMinutes() === 0) {
                    const { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ weekly_value: token.weekly_value.slice(1).concat(tokenData.prices) })
                    .eq('symbol', tokenData.symbol);

                    if (updateError) {
                        throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                    }
                }

                const { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ daily_value: token.daily_value.slice(1).concat(tokenData.prices) })
                    .eq('symbol', tokenData.symbol);

                if (updateError) {
                    throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                }

                const { error: updateError2 } = await this.supabase
                    .from('token_list')
                    .update({ last_value: tokenData.prices[0].value })
                    .eq('symbol', tokenData.symbol);

                if (updateError2) {
                    throw new Error(`Error updating token (${tokenData.symbol}): ${updateError2.message}`);
                }

            });
        } catch (error) {
            console.error('Error fetching or updating token prices:', error.message);
            throw error;
        }
    }

    async getEthBalance(address: string): Promise<string> {

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

    public async updateTokenBalances(address: string = "Empty") {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        let users: any[] = address === "Empty" ? [] : [{ wallet_address: address }];
        if (address === "Empty") {
            // Fetch all users from the database
            const { data: users, error } = await this.supabase.from('users').select('wallet_address');
            if (error) throw new Error(`Error fetching users: ${error.message}`);

        }

        for (const user of users) {
            const data = {
                jsonrpc: '2.0',
                method: 'alchemy_getTokenBalances',
                params: [user.wallet_address],
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
                const { error: updateError } = await this.supabase.from('users').update({ balances: res }).eq('wallet_address', user.wallet_address);

                if (updateError) throw new Error(`Error updating balances: ${updateError.message}`);

            } catch (error) {
                Logger.error('Error fetching or processing token balances:', error.message);
                throw error;
            }
        }
    }

    /*

                Currency API Calls

    */


    fillMissingData(rates: Record<string, Record<string, number>>, startDate: string, endDate: string) {
                    const filledRates: Record<string, Record<string, number>> = {};
                    let lastKnownDate: string | null = null;
                    let lastKnownRate: Record<string, number> | null = null;
            
                    // Generate all dates from startDate to endDate
                    const dateRange = this.generateDateRange(startDate, endDate);
            
                    for (const date of dateRange) {
                        if (rates[date]) {
                            // If the data exists for this date, store the current rates and update last known
                            filledRates[date] = rates[date];
                            lastKnownDate = date;
                            lastKnownRate = rates[date];
                        } else {
                            // If data is missing, use the last known rate
                            if (lastKnownRate) {
                                filledRates[date] = lastKnownRate;
                            }
                        }
                    }
            
                    return filledRates;
    }

    generateDateRange(startDate: string, endDate: string): string[] {
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    const dateRange: string[] = [];
            
                    while (start <= end) {
                        const year = start.getFullYear();
                        const month = String(start.getMonth() + 1).padStart(2, '0');
                        const day = String(start.getDate()).padStart(2, '0');
                        dateRange.push(`${year}-${month}-${day}`);
                        start.setDate(start.getDate() + 1);
                    }
            
                    return dateRange;
    }

    // ON THE WAY TO BE IMPLEMENTED TO MOVE ON AN OTHER DIRECTORY BECAUSE IT'S NOT RELATED TO ALCHEMY
    public async getCurrenciesHistoricPrice(symbol: string) {

        try {
            const base = 'USD';
            const currentTime = new Date();
            const begin_date = currentTime.toISOString().split('T')[0];
            const end_date = new Date(currentTime);
            end_date.setFullYear(currentTime.getFullYear() - 1);
            const formatted_date = end_date.toISOString().split('T')[0];
            // Make the API request using the dynamically created symbols
            const url = `https://api.frankfurter.dev/v1/${formatted_date}..${begin_date}?base=${base}&symbols=${symbol}`;
            const response = await axios.get(url, {
                headers: { accept: 'application/json', 'content-type': 'application/json' },
            });
            const { data } = response;

            const rates = data['rates'];
            const filledRates = this.fillMissingData(rates, formatted_date, begin_date);

            // Process the API response
            const result = Object.entries(filledRates).flatMap(([timestamp, rates]) =>
                Object.entries(rates).map(([currency, value]) => ({
                    timestamp,
                    symbol: currency,
                    value,
                }))
            );

            // Group results by symbol
            const groupedResult = result.reduce((acc, item) => {
                if (!acc[item.symbol]) {
                    acc[item.symbol] = [];
                }
                acc[item.symbol].push({
                    timestamp: item.timestamp,
                    value: item.value,
                });
                return acc;
            }, {} as Record<string, any[]>);

            // Update the database with the fetched data
            for (const [symbol, values] of Object.entries(groupedResult)) {

                const { error: updateError } = await this.supabase
                        .from('exchange_rate')
                        .update({ value: values })
                        .eq('symbol', symbol);

                if (updateError) {
                    throw new Error(`Error updating token (${symbol}): ${updateError.message}`);
                }
            }

        } catch (error) {
            console.error('Error fetching or updating currency prices:', error.message);
            throw error;
        }
    }

    // TO DO
    async updateCurrencyPrice() {}
}