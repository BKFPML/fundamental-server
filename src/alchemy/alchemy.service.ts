import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Status
    , TokenHistoricPriceArray
    , TokenHistoricPriceArrayWithSymbol
} from '../../template/type';
import { stat } from 'fs';

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

    async getTokenHistoricPrices(symbol: string = "WETH"): Promise<Status> {
        Logger.log("Fetching token history for symbol: ", symbol);
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
                        return { exitCode: 500, message: `Error fetching token history for ${symbol}: ${errorText}` };
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
                                return { exitCode: 500, message: `Error updating token (${sym}): ${updateError.message}` };
                            }
                        }
                    } else {
                        return { exitCode: 500, message: `No data found for symbol ${symbol} in interval ${i.name}` };
                    }
                })
                .catch((err) => {
                    return { exitCode: 500, message: `Error fetching token history for ${symbol}: ${err.message}` };
                });
            await this.delay(1000);
        }
        return {exitCode: 200, message: 'Token historical prices updated successfully'};
    }

    private async updateTokenHistoricPrices(token: TokenHistoricPriceArrayWithSymbol): Promise<TokenHistoricPriceArrayWithSymbol | { status: Status }> {
        const { exitCode, message } = await this.getTokenHistoricPrices(token.symbol);
        if (exitCode !== 200) return { status: { exitCode, message } };

        const { error, data } = await this.supabase
            .from('token_list')
            .select('daily_values, weekly_values, monthly_values, yearly_values')
            .eq('symbol', token.symbol);

        if (error) return { status: { exitCode: 500, message: `Error fetching token historic prices: ${error.message}` } };
        if (!data || data.length === 0) return { status: { exitCode: 404, message: `Token ${token.symbol} not found` } };

        const { daily_values, weekly_values, monthly_values, yearly_values } = data[0];
        Logger.log("Daily values: ", token.daily_values);
        token.daily_values = [{value: 0, label: 'placeholder'}].concat(daily_values.slice(0, -1));
        token.weekly_values = [{value: 0, label: 'placeholder'}].concat(weekly_values.slice(0, -1));
        token.monthly_values = [{value: 0, label: 'placeholder'}].concat(monthly_values.slice(0, -1));
        token.yearly_values =  [{value: 0, label: 'placeholder'}].concat(yearly_values.slice(0, -1));
        return token;
    }

    public async updateTokenPriceInDollars(): Promise<Status> {
        const currentTime: Date = new Date();
        const nb_minutes: number = currentTime.getUTCMinutes();
        const nb_hours: number = currentTime.getUTCHours();
        const dayOfYear: number = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));

        console.log("Current minutes: ", nb_minutes);
        console.log("Current hours: ", nb_hours);
        console.log("Current day of year: ", dayOfYear);

        const { data, error } = await this.supabase
            .from('token_list')
            .select('symbol, daily_values, weekly_values, monthly_values, yearly_values');
        if (error) return { exitCode: 500, message: 'Error fetching tokens: ' + error.message };
        const tokens = data as TokenHistoricPriceArrayWithSymbol[];

        for (let token of tokens) {
            const res = await this.updateTokenHistoricPrices(token);
            if ('status' in res) {
                const { exitCode, message } = res.status;
                return { exitCode, message: `Error updating token ${token.symbol}: ${message}` };
            }
            // ???????????????
            // if (Array.isArray(token.daily_values) === false) {
            //     token = await this.updateTokenHistoricPrices(token);
            // } else if (currentTime.getTime() - new Date(token.daily_values.slice(-1)[0].label).getTime() >  30 * 60 * 1000) {
            //     token = await this.updateTokenHistoricPrices(token);
            // }
        }
        if (!tokens || tokens.length === 0) return { exitCode: 404, message: 'No tokens found in the database' };

        const symbolsQuery = tokens.map(token => `symbols=${token.symbol}`).join('&'); // Create query string
        const url = `https://api.g.alchemy.com/prices/v2/${this.apiKey}/tokens/by-symbol?${symbolsQuery}`; // Create URL

        // Fetch token prices
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: 'application/json',
            },
        });

        if (!response.data.data) return { exitCode: 500, message: 'No data found in the response' };
        if (response.data.data.length === 0) return { exitCode: 404, message: 'No tokens found in the response' };
        if (response.data.errors) return { exitCode: 500, message: `Error in response: ${response.data.errors.map((error: any) => error.message).join(', ')}` };

        const results: any[] = response.data.data;

        for (const tokenData of results) {

            tokenData.prices = tokenData.prices.map((price: any) => ({
                value: parseFloat(price.value),
                label: price.lastUpdatedAt
            }));

            const token = tokens.find(t => t.symbol === tokenData.symbol);
            if (!token) return { exitCode: 404, message: `Token not found in the database: ${tokenData.symbol}` };

            const updates:any = { last_value: tokenData.prices[0].value };

            // Update Yearly values every 3 days
            if (dayOfYear % 3 && nb_hours === 0 && nb_minutes === 0) {
                const updatedYearlyValues = [...token.yearly_values];
                updatedYearlyValues.shift();
                updatedYearlyValues.push({ ...tokenData.prices[0] });
                updates.yearly_values = updatedYearlyValues;
            }

            // Update Monthly values every 6 hours
            if (nb_hours % 6 === 0 && nb_minutes === 0) {
                const updatedMontlyValues = [...token.monthly_values];
                updatedMontlyValues.shift();
                updatedMontlyValues.push({ ...tokenData.prices[0] });
                updates.monthly_values = updatedMontlyValues;
            }

            // Update Weekly values every hour
            if (nb_minutes === 0) {
                const updatedWeeklyValues = [...token.weekly_values];
                updatedWeeklyValues.shift();
                updatedWeeklyValues.push({ ...tokenData.prices[0] });
                updates.weekly_values = updatedWeeklyValues;
            }

            // Update Daily values every 10 minutes
            const updatedDailyValues = [...token.daily_values];
            updatedDailyValues.shift();
            updatedDailyValues.push({ ...tokenData.prices[0] });
            updates.daily_values = updatedDailyValues;

            // Update token in the database
            let { error: updateError } = await this.supabase
                .from('token_list')
                .update(updates)
                .eq('symbol', tokenData.symbol);

            if (updateError) return { exitCode: 500, message: `Error updating token ${tokenData.symbol}: ${updateError.message}` };
        }
        return { exitCode: 200, message: 'Token prices updated successfully' };
    }

    async getEthBalance(address: string): Promise<any> {

        const network = "base"
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        const data = {
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1
        };

        let response = await axios.post(Url, data);
        if (response.data.error) {
            Logger.error(`Error fetching ETH balance for ${address}: ${response.data.error.message}`);
            return 0;
        }
        let tokenBalanceWei = parseInt(response.data.result, 16);
        let tokenBalance = parseFloat(tokenBalanceWei.toString()) / Math.pow(10, 18); // Convert to Ether
        let tokenValue = tokenBalance * 2000; // Assuming the value of ETH is 2000 USD for example
        let tokenBalanceInUSD = {
            address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            balance: tokenBalanceWei,
            value: tokenValue,
        };
        return tokenBalanceInUSD;
    }

    public async updateTokenBalances(address: string = "Empty"): Promise<Status> {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        let users: any[] = [];

        if (address === "Empty") {
            // Fetch all users from the database
            const { data: users_r, error } = await this.supabase.from('users').select('wallet_address, total_value_historic');
            if (error) return { exitCode: 500, message: 'Error fetching users: ' + error.message };
            if (!users_r || users_r.length === 0) return { exitCode: 404, message: 'No users found in the database' };
            users = users_r;
        } else {
            // Fetch only the user with the provided address
            const { data: user_r, error } = await this.supabase.from('users').select('wallet_address, total_value_historic').eq('wallet_address', address);
            if (error) return { exitCode: 500, message: 'Error fetching user: ' + error.message };
            if (!user_r || user_r.length === 0) return { exitCode: 404, message: 'User not found in the database' };
            users = user_r;
        }

        const { data: acceptedTokens, error: errorTokens } = await this.supabase.from('token_list').select('address, digits, last_value');
        if (errorTokens) return { exitCode: 500, message: 'Error fetching accepted tokens: ' + errorTokens.message };

        for (const user of users) {
            const data = {
                jsonrpc: '2.0',
                method: 'alchemy_getTokenBalances',
                params: [user.wallet_address],
                id: 1,
            };

            // Fetch balances from Alchemy
            let response  = await axios.post(url, data);

            if (response.data.error) {
                return { exitCode: 500, message: `Error fetching token balances for ${user.wallet_address}: ${response.data.error.message}` };
            }

            console.log(response.data);
            if (!response.data.result) return { exitCode: 500, message: `No result found for ${user.wallet_address}` };
            const balances = response.data.result.tokenBalances;
            if (!balances) return { exitCode: 500, message: `No balances found for ${user.wallet_address}` };

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

            let tokenBalanceWei = await this.getEthBalance(user.wallet_address);

            // Add ETH balance to the filtered balances
            filteredBalances.push(tokenBalanceWei);

            // Set at 0 all the token in acceptedTokens that are not in filteredBalances
            for (const token of acceptedTokens) {
                if (!filteredBalances.some((balance: any) => balance.address.toLowerCase() === token.address.toLowerCase())) {
                    filteredBalances.push({
                        address: token.address,
                        balance: 0,
                        value: 0,
                    });
                }
            }

            // Update balances in the database
            const { error: updateError } = await this.supabase.from('users').update({ balances: filteredBalances }).eq('wallet_address', user.wallet_address);
            if (updateError) return { exitCode: 500, message: `Error updating balances: ${updateError.message}` };

            // let totalValue = 0;
            // for (const balance of filteredBalances) {
            //     totalValue += balance.value;
            // }

            // const { error: updateError2 } = await this.supabase.from('users').update({total_value_historic: user.total_value_historic.concat({value:totalValue, timestamp: new Date()}) }).eq('wallet_address', user.wallet_address);
            // if (updateError2) throw new Error(`Error updating total value: ${updateError2.message}`);
        }
        return { exitCode: 200, message: 'Token balances updated successfully' };
    }
}
