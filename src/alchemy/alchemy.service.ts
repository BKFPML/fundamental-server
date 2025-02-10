import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { timestamp } from 'rxjs';
import { log } from 'console';
import { parse } from 'path';


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

    async getTokenHistoricPrices(symbol: string = "WETH"): Promise<void> {
        const currentTime = new Date();
        const intervals = [
            { name: "yearly_values", interval: "1d", startTime: new Date(currentTime.getTime() - 364 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 3 }, // 364 / 3 = 121 value
            { name: "monthly_values", interval: "1h", startTime: new Date(currentTime.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 6 }, // 1 * 24 * 30 / 6 = 120 value
            { name: "weekly_values", interval: "1h", startTime: new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), data_keep: 1 }, // 1 * 24 * 7 = 168 value
            { name: "daily_values", interval: "5m", startTime: new Date(currentTime.getTime() - 24 * 60 * 60 * 1000).toISOString(), data_keep: 2 },
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
                .then(async (res) => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(`API Error: ${res.status} ${errorText}`);
                    }
                    return res.json();
                })
                .then(async (res) => {
                    if (res.data) {
                        let data = res.data.filter((_, index) => index % i.data_keep === 0);

                        data = data.map((item: { value: any; timestamp: any }) => ({
                            value: parseFloat(item.value),
                            label: item.timestamp
                        }));
    
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
            await this.delay(1000);
        }
    }

    public async updateTokenPriceInDollars(): Promise<void> {
        try {
            Logger.log(process.env.SUPABASE_URL);
            const { data: tokens, error } = await this.supabase
                .from('token_list')
                .select('symbol, daily_values, weekly_values, monthly_values, yearly_values');

            if (error) throw new Error(`Error fetching tokens: ${error.message}`);
            if (!tokens || tokens.length === 0) throw new Error('No tokens found in the database');

            const symbolsQuery = tokens.map(token => `symbols=${token.symbol}`).join('&'); // Create query string
            const url = `https://api.g.alchemy.com/prices/v2/${this.apiKey}/tokens/by-symbol?${symbolsQuery}`; // Create URL

            // Fetch token prices
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                },
            });

            if (!response.data.data) throw new Error('No data found in the response');
            if (response.data.data.length === 0) throw new Error('No data found in the response');
            if (response.data.errors) throw new Error(`API Error: ${response.data.errors}`);

            const results: any[] = response.data.data;

            for (const tokenData of results) {

                tokenData.prices = tokenData.prices.map((price: any) => ({
                    value: parseFloat(price.value),
                    label: price.lastUpdatedAt
                }));

                const token = tokens.find(t => t.symbol === tokenData.symbol);
                if (!token) throw new Error(`Token not found in the database: ${tokenData.symbol}`);

                const currentTime = new Date();
                const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));

                if (dayOfYear % 3 && currentTime.getUTCHours() === 0 && currentTime.getUTCMinutes() === 0) {
                    const updatedYearlyValues = [...token.yearly_values];
                    updatedYearlyValues.shift();
                    updatedYearlyValues.push(tokenData.prices[0]);

                    const { error: updateError } = await this.supabase
                        .from('token_list')
                        .update({ yearly_values: updatedYearlyValues })
                        .eq('symbol', tokenData.symbol);

                    if (updateError) throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                }

                if (currentTime.getUTCHours() % 6 === 0 && currentTime.getUTCMinutes() === 0) {
                    const updatedMontlyValues = [...token.monthly_values];
                    updatedMontlyValues.shift();
                    updatedMontlyValues.push(tokenData.prices[0]);

                    const { error: updateError } = await this.supabase
                        .from('token_list')
                        .update({ monthly_values: updatedMontlyValues })
                        .eq('symbol', tokenData.symbol);

                    if (updateError) throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                }

                if (currentTime.getUTCMinutes() === 0) {
                    const updatedWeeklyValues = [...token.weekly_values];
                    updatedWeeklyValues.shift();
                    updatedWeeklyValues.push(tokenData.prices[0]);

                    const { error: updateError } = await this.supabase
                        .from('token_list')
                        .update({ weekly_values: updatedWeeklyValues })
                        .eq('symbol', tokenData.symbol);

                    if (updateError) {
                        throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                    }
                }

                const updatedDailyValues = [...token.daily_values];
                updatedDailyValues.shift();
                updatedDailyValues.push(tokenData.prices[0]);

                let { error: updateError } = await this.supabase
                    .from('token_list')
                    .update({ daily_values: updatedDailyValues })
                    .eq('symbol', tokenData.symbol);
                console.log("Error: ");
                console.log(updateError);
                
                if (updateError) {
                    console.log(updateError);
                    throw new Error(`Error updating token (${tokenData.symbol}): ${updateError.message}`);
                }

            //     const { error: lastValueError } = await this.supabase
            //         .from('token_list')
            //         .update({ last_value: tokenData.prices[0].value })
            //         .eq('symbol', tokenData.symbol);

            //     if (lastValueError) throw new Error(`Error updating token (${tokenData.symbol}): ${lastValueError.message}`);
            }
        } catch (error) {
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

            return weiBalance;
        } catch (error) {
            Logger.log(error);
            throw error;
        }
    }

    public async updateTokenBalances(address: string = "Empty"): Promise<void> {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        let users: any[] = address === "Empty" ? [] : [{ wallet_address: address }];

        if (address === "Empty") {
            // Fetch all users from the database
            const { data: users_r, error } = await this.supabase.from('users').select('wallet_address, total_value_historic');
            if (error) throw new Error(`Error fetching users: ${error.message}`);
            users = users_r;
        }

        const { data: acceptedTokens, error: errorTokens } = await this.supabase.from('token_list').select('address, digits, last_value');
        if (errorTokens) throw new Error(`Error fetching tokens: ${errorTokens.message}`);

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

                // Filter out only the accepted tokens based on their address
                const filteredBalances = balances
                    .filter((balance: any) =>
                        acceptedTokens.some((token: any) => token.address.toLowerCase() === balance.contractAddress.toLowerCase())
                    )
                    .map((balance: any) => {
                        // Find the matching token from acceptedTokens
                        const token = acceptedTokens.find((token: any) => token.address.toLowerCase() === balance.contractAddress.toLowerCase());
                        //Convert tokenbalance whose on hex to decimal
                        const tokenBalanceWei = parseInt(balance.tokenBalance, 16);
                        balance.tokenBalance = parseInt(balance.tokenBalance, 16).toString();

                        // Convert balance to the correct number of tokens using the digits
                        const tokenBalance = parseFloat(balance.tokenBalance) / Math.pow(10, token.digits);

                        // Calculate the value of the token in USD (or any other currency)
                        const tokenValue = tokenBalance * token.last_value;

                        return {
                            address: balance.contractAddress,
                            balance: tokenBalanceWei,
                            value: tokenValue,
                        };
                    });

                // Update balances in the database
                const { error: updateError } = await this.supabase.from('users').update({ balances: filteredBalances }).eq('wallet_address', user.wallet_address);
                if (updateError) throw new Error(`Error updating balances: ${updateError.message}`);

                let totalValue = 0;
                for (const balance of filteredBalances) {
                    totalValue += balance.value;
                }

                const { error: updateError2 } = await this.supabase.from('users').update({total_value_historic: user.total_value_historic.concat({value:totalValue, timestamp: new Date()}) }).eq('wallet_address', user.wallet_address);
                if (updateError2) throw new Error(`Error updating total value: ${updateError2.message}`);

            } catch (error) {
                Logger.error('Error fetching or processing token balances:', error.message);
                throw error;
            }
            // Add delay to avoid overloading API
            await this.delay(5000);
        }
    }
}