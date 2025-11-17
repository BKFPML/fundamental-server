import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import {
    Status,
    TokenHistoricPriceArray,
    TokenHistoricPriceArrayWithSymbol
} from '../../template/type';

@Injectable()
export class AlchemyService {
    private readonly apiKey: string;
    private readonly supabaseUrl: string;
    private readonly supabaseKey: string;
    public supabase: any;
    private readonly logger = new Logger(AlchemyService.name);

    constructor(private readonly configService: ConfigService) {
        this.apiKey = this.configService.get<string>('ALCHEMY_API_KEY');
        this.supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        this.supabaseKey = this.configService.get<string>('SUPABASE_KEY');
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    }

    /* Utility Functions */

    async delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /* Token API Calls */

    async getTokenHistoricPrices(symbol: string = "WETH"): Promise<Status> {
        this.logger.log(`Fetching token history for symbol: ${symbol}`);
        const currentTime = new Date();
        const intervals = [
            { 
                name: "yearly_values", 
                interval: "1d", 
                startTime: new Date(currentTime.getTime() - 364 * 24 * 60 * 60 * 1000).toISOString(), 
                data_keep: 3 
            },
            { 
                name: "monthly_values", 
                interval: "1h", 
                startTime: new Date(currentTime.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
                data_keep: 6 
            },
            { 
                name: "weekly_values", 
                interval: "1h", 
                startTime: new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), 
                data_keep: 1 
            },
            { 
                name: "daily_values", 
                interval: "5m", 
                startTime: new Date(currentTime.getTime() - 24 * 60 * 60 * 1000).toISOString(), 
                data_keep: 2 
            },
        ];

        for (const interval of intervals) {
            try {
                const options = {
                    method: 'POST',
                    headers: { 
                        accept: 'application/json', 
                        'content-type': 'application/json' 
                    },
                    body: JSON.stringify({
                        symbol: symbol,
                        startTime: interval.startTime,
                        endTime: currentTime.toISOString(),
                        interval: interval.interval,
                    }),
                };

                this.logger.debug(`Fetching ${interval.name} for ${symbol}`);
                
                const response = await fetch(
                    `https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`, 
                    options
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    this.logger.error(`Error fetching ${interval.name} for ${symbol}: ${errorText}`);
                    return { 
                        exitCode: 500, 
                        message: `Error fetching ${interval.name} for ${symbol}: ${errorText}` 
                    };
                }

                const responseData = await response.json();

                if (!responseData.data || responseData.data.length === 0) {
                    this.logger.error(`No data found for ${symbol} in ${interval.name}`);
                    return { 
                        exitCode: 500, 
                        message: `No data found for ${symbol} in ${interval.name}` 
                    };
                }

                // Filter and map data
                let processedData = responseData.data
                    .filter((_: any, index: number) => index % interval.data_keep === 0)
                    .map((item: { value: any; timestamp: any }) => ({
                        value: parseFloat(item.value),
                        label: item.timestamp
                    }));

                // Update database for symbol(s)
                const symbolsToUpdate = symbol === "WETH" ? ["WETH", "ETH"] : [symbol];
                
                for (const sym of symbolsToUpdate) {
                    const { error: updateError } = await this.supabase
                        .from('token_list')
                        .update({ [interval.name]: processedData })
                        .eq('symbol', sym);

                    if (updateError) {
                        this.logger.error(`Error updating ${sym}: ${updateError.message}`);
                        return { 
                            exitCode: 500, 
                            message: `Error updating ${sym}: ${updateError.message}` 
                        };
                    }
                }

                await this.delay(1000); // Rate limiting
            } catch (err) {
                this.logger.error(`Error in ${interval.name} for ${symbol}:`, err);
                return { 
                    exitCode: 500, 
                    message: `Error in ${interval.name}: ${err.message}` 
                };
            }
        }

        this.logger.log("Finished updating token historical prices");
        return { exitCode: 200, message: 'Token historical prices updated successfully' };
    }

    private async updateTokenHistoricPrices(
        token: TokenHistoricPriceArrayWithSymbol
    ): Promise<TokenHistoricPriceArrayWithSymbol | { status: Status }> {
        const { exitCode, message } = await this.getTokenHistoricPrices(token.symbol);
        
        if (exitCode !== 200) {
            return { status: { exitCode, message } };
        }

        const { error, data } = await this.supabase
            .from('token_list')
            .select('daily_values, weekly_values, monthly_values, yearly_values')
            .eq('symbol', token.symbol)
            .single();

        if (error) {
            return { 
                status: { 
                    exitCode: 500, 
                    message: `Error fetching token historic prices: ${error.message}` 
                } 
            };
        }

        if (!data) {
            return { 
                status: { 
                    exitCode: 404, 
                    message: `Token ${token.symbol} not found` 
                } 
            };
        }

        const { daily_values, weekly_values, monthly_values, yearly_values } = data;
        
        // Add placeholder and remove last element
        token.daily_values = [{ value: 0, label: 'placeholder' }, ...daily_values.slice(0, -1)];
        token.weekly_values = [{ value: 0, label: 'placeholder' }, ...weekly_values.slice(0, -1)];
        token.monthly_values = [{ value: 0, label: 'placeholder' }, ...monthly_values.slice(0, -1)];
        token.yearly_values = [{ value: 0, label: 'placeholder' }, ...yearly_values.slice(0, -1)];
        
        return token;
    }

    public async updateTokenPriceInDollars(): Promise<Status> {
        const currentTime = new Date();
        const nb_minutes = currentTime.getUTCMinutes();
        const nb_hours = currentTime.getUTCHours();
        const dayOfYear = Math.floor(
            (currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / 
            (1000 * 60 * 60 * 24)
        );

        this.logger.debug(`Time check - Minutes: ${nb_minutes}, Hours: ${nb_hours}, Day: ${dayOfYear}`);

        // Fetch tokens from database
        const { data, error } = await this.supabase
            .from('token_list')
            .select('symbol, daily_values, weekly_values, monthly_values, yearly_values');

        if (error) {
            return { exitCode: 500, message: `Error fetching tokens: ${error.message}` };
        }

        if (!data || data.length === 0) {
            return { exitCode: 404, message: 'No tokens found in the database' };
        }

        const tokens = data as TokenHistoricPriceArrayWithSymbol[];
        this.logger.log(`Fetched ${tokens.length} tokens`);

        // OPTIMIZATION: Don't fetch historic data every time, only when needed
        // Full historic refresh should be done separately (e.g., once per day)
        // This function should only update current prices

        // Fetch current prices from Alchemy
        const symbolsQuery = tokens.map(token => `symbols=${token.symbol}`).join('&');
        const url = `https://api.g.alchemy.com/prices/v2/${this.apiKey}/tokens/by-symbol?${symbolsQuery}`;

        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                },
            });
        } catch (err) {
            return { exitCode: 500, message: `Error fetching prices from Alchemy: ${err.message}` };
        }

        if (!response.data.data || response.data.data.length === 0) {
            return { exitCode: 404, message: 'No token data in response' };
        }

        if (response.data.errors) {
            const errorMessages = response.data.errors.map((error: any) => error.message).join(', ');
            return { exitCode: 500, message: `Alchemy API errors: ${errorMessages}` };
        }

        const results = response.data.data;

        // Update each token with new prices
        for (const tokenData of results) {
            tokenData.prices = tokenData.prices.map((price: any) => ({
                value: parseFloat(price.value),
                label: price.lastUpdatedAt
            }));

            const token = tokens.find(t => t.symbol === tokenData.symbol);
            
            if (!token) {
                this.logger.warn(`Token ${tokenData.symbol} not found in local data`);
                continue;
            }

            if (tokenData.prices.length === 0) {
                this.logger.warn(`No price data for token ${tokenData.symbol}`);
                continue;
            }

            if (isNaN(parseFloat(tokenData.prices[0].value))) {
                this.logger.warn(`Invalid price data for token ${tokenData.symbol}`);
                continue;
            }

            const updates: any = { 
                last_value: parseFloat(tokenData.prices[0].value) 
            };

            // BUG FIX: Changed condition from "dayOfYear % 3" to "dayOfYear % 3 === 0"
            // Update Yearly values every 3 days at midnight
            if (dayOfYear % 3 === 0 && nb_hours === 0 && nb_minutes === 0) {
                const updatedYearlyValues = [...token.yearly_values.slice(1)];
                updatedYearlyValues.push({ ...tokenData.prices[0] });
                updates.yearly_values = updatedYearlyValues;
            }

            // Update Monthly values every 6 hours
            if (nb_hours % 6 === 0 && nb_minutes === 0) {
                const updatedMonthlyValues = [...token.monthly_values.slice(1)];
                updatedMonthlyValues.push({ ...tokenData.prices[0] });
                updates.monthly_values = updatedMonthlyValues;
            }

            // Update Weekly values every hour
            if (nb_minutes === 0) {
                const updatedWeeklyValues = [...token.weekly_values.slice(1)];
                updatedWeeklyValues.push({ ...tokenData.prices[0] });
                updates.weekly_values = updatedWeeklyValues;
            }

            // Update Daily values every 10 minutes
            const updatedDailyValues = [...token.daily_values.slice(1)];
            updatedDailyValues.push({ ...tokenData.prices[0] });
            updates.daily_values = updatedDailyValues;

            this.logger.debug(`Updating ${tokenData.symbol} with price: ${updates.last_value}`);

            // Update database
            const { error: updateError } = await this.supabase
                .from('token_list')
                .update(updates)
                .eq('symbol', tokenData.symbol);

            if (updateError) {
                return { 
                    exitCode: 500, 
                    message: `Error updating token ${tokenData.symbol}: ${updateError.message}` 
                };
            }
        }

        return { exitCode: 200, message: 'Token prices updated successfully' };
    }

    // NEW METHOD: Refresh one token at a time in rotation (spreads API calls over time)
    public async refreshNextTokenHistoricData(): Promise<Status> {
        this.logger.log('Refreshing historic data for next token in rotation...');
        
        // Get all tokens and their last update time
        const { data: tokens, error } = await this.supabase
            .from('token_list')
            .select('symbol, historic_last_refresh')
            .order('historic_last_refresh', { ascending: true, nullsFirst: true });

        if (error) {
            return { exitCode: 500, message: `Error fetching tokens: ${error.message}` };
        }

        if (!tokens || tokens.length === 0) {
            return { exitCode: 404, message: 'No tokens found' };
        }

        // Get the token that needs refresh the most (oldest or never refreshed)
        const tokenToRefresh = tokens[0];
        
        this.logger.log(`Refreshing historic data for ${tokenToRefresh.symbol}...`);
        
        try {
            const result = await this.getTokenHistoricPrices(tokenToRefresh.symbol);
            
            if (result.exitCode === 200) {
                // Update the last refresh timestamp
                await this.supabase
                    .from('token_list')
                    .update({ historic_last_refresh: new Date().toISOString() })
                    .eq('symbol', tokenToRefresh.symbol);
                
                return { 
                    exitCode: 200, 
                    message: `Historic data refreshed for ${tokenToRefresh.symbol}` 
                };
            }
            
            return result;
        } catch (err) {
            return { 
                exitCode: 500, 
                message: `Error refreshing ${tokenToRefresh.symbol}: ${err.message}` 
            };
        }
    }

    // OPTIONAL: Full refresh (use only for initial setup or maintenance)
    public async refreshAllTokenHistoricData(): Promise<Status> {
        this.logger.warn('⚠️ Starting FULL historic refresh - this will use many API calls!');
        
        const { data, error } = await this.supabase
            .from('token_list')
            .select('symbol');

        if (error) {
            return { exitCode: 500, message: `Error fetching tokens: ${error.message}` };
        }

        if (!data || data.length === 0) {
            return { exitCode: 404, message: 'No tokens found' };
        }

        let successCount = 0;
        let failCount = 0;

        for (const token of data) {
            try {
                this.logger.log(`Refreshing historic data for ${token.symbol}...`);
                const result = await this.getTokenHistoricPrices(token.symbol);
                
                if (result.exitCode === 200) {
                    successCount++;
                    // Update timestamp
                    await this.supabase
                        .from('token_list')
                        .update({ historic_last_refresh: new Date().toISOString() })
                        .eq('symbol', token.symbol);
                } else {
                    failCount++;
                    this.logger.error(`Failed to refresh ${token.symbol}: ${result.message}`);
                }
                
                // Longer delay to respect rate limits
                await this.delay(5000);
            } catch (err) {
                failCount++;
                this.logger.error(`Error refreshing ${token.symbol}:`, err);
            }
        }

        return { 
            exitCode: failCount === 0 ? 200 : 207, 
            message: `Historic refresh complete: ${successCount} succeeded, ${failCount} failed` 
        };
    }

    async getEthBalance(address: string): Promise<any> {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        
        const data = {
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1
        };

        try {
            const response = await axios.post(url, data);
            
            if (response.data.error) {
                this.logger.error(`Error fetching ETH balance for ${address}: ${response.data.error.message}`);
                return {
                    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                    balance: 0,
                    value: 0,
                };
            }

            const tokenBalanceWei = parseInt(response.data.result, 16);
            const tokenBalance = tokenBalanceWei / Math.pow(10, 18);

            // BUG FIX: Get actual ETH price from database instead of hardcoded 2000
            const { data: ethData } = await this.supabase
                .from('token_list')
                .select('last_value')
                .eq('symbol', 'ETH')
                .single();

            const ethPrice = ethData?.last_value || 2000; // Fallback to 2000 if not found
            const tokenValue = tokenBalance * ethPrice;

            return {
                address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                balance: tokenBalanceWei,
                value: tokenValue,
            };
        } catch (err) {
            this.logger.error(`Error in getEthBalance for ${address}:`, err);
            return {
                address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                balance: 0,
                value: 0,
            };
        }
    }

    public async updateTokenBalances(address: string = "Empty"): Promise<Status> {
        const network = "base";
        const url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        let users: any[] = [];

        // Fetch users
        if (address === "Empty") {
            const { data: users_r, error } = await this.supabase
                .from('users')
                .select('wallet_address, total_value_historic');
            
            if (error) {
                return { exitCode: 500, message: `Error fetching users: ${error.message}` };
            }
            if (!users_r || users_r.length === 0) {
                return { exitCode: 404, message: 'No users found in the database' };
            }
            users = users_r;
        } else {
            const { data: user_r, error } = await this.supabase
                .from('users')
                .select('wallet_address, total_value_historic')
                .eq('wallet_address', address);
            
            if (error) {
                return { exitCode: 500, message: `Error fetching user: ${error.message}` };
            }
            if (!user_r || user_r.length === 0) {
                return { exitCode: 404, message: 'User not found in the database' };
            }
            users = user_r;
        }

        // Fetch accepted tokens
        const { data: acceptedTokens, error: errorTokens } = await this.supabase
            .from('token_list')
            .select('address, digits, last_value');

        if (errorTokens) {
            return { exitCode: 500, message: `Error fetching accepted tokens: ${errorTokens.message}` };
        }

        // Process each user
        for (const user of users) {
            const data = {
                jsonrpc: '2.0',
                method: 'alchemy_getTokenBalances',
                params: [user.wallet_address],
                id: 1,
            };

            let response;
            try {
                response = await axios.post(url, data);
            } catch (err) {
                return { 
                    exitCode: 500, 
                    message: `Error fetching balances for ${user.wallet_address}: ${err.message}` 
                };
            }

            if (response.data.error) {
                return { 
                    exitCode: 500, 
                    message: `Error fetching token balances for ${user.wallet_address}: ${response.data.error.message}` 
                };
            }

            if (!response.data.result || !response.data.result.tokenBalances) {
                return { 
                    exitCode: 500, 
                    message: `No balances found for ${user.wallet_address}` 
                };
            }

            const balances = response.data.result.tokenBalances;

            // Filter and process balances
            const filteredBalances = balances
                .filter((balance: any) =>
                    acceptedTokens.some(
                        (token: any) => token.address.toLowerCase() === balance.contractAddress.toLowerCase()
                    )
                )
                .map((balance: any) => {
                    const token = acceptedTokens.find(
                        (token: any) => token.address.toLowerCase() === balance.contractAddress.toLowerCase()
                    );

                    const tokenBalanceWei = parseInt(balance.tokenBalance, 16);
                    const tokenBalance = tokenBalanceWei / Math.pow(10, token.digits);
                    const tokenValue = tokenBalance * token.last_value;

                    return {
                        address: balance.contractAddress,
                        balance: tokenBalanceWei,
                        value: tokenValue,
                    };
                });

            // Add ETH balance
            const ethBalance = await this.getEthBalance(user.wallet_address);
            filteredBalances.push(ethBalance);

            // Add missing tokens with 0 balance
            for (const token of acceptedTokens) {
                if (!filteredBalances.some(
                    (balance: any) => balance.address.toLowerCase() === token.address.toLowerCase()
                )) {
                    filteredBalances.push({
                        address: token.address,
                        balance: 0,
                        value: 0,
                    });
                }
            }

            // Update balances in database
            const { error: updateError } = await this.supabase
                .from('users')
                .update({ balances: filteredBalances })
                .eq('wallet_address', user.wallet_address);

            if (updateError) {
                return { exitCode: 500, message: `Error updating balances: ${updateError.message}` };
            }

            // Calculate total value
            const totalValue = filteredBalances.reduce(
                (sum: number, balance: any) => sum + balance.value, 
                0
            );

            // BUG FIX: Better handling of totalValueHistoric array
            let totalValueHistoric = user.total_value_historic || [];
            
            // Initialize with 168 zero entries if needed
            if (totalValueHistoric.length === 0) {
                const now = Date.now();
                for (let i = 167; i >= 0; i--) {
                    totalValueHistoric.push({
                        value: 0,
                        timestamp: new Date(now - (i * 60 * 60 * 1000)).toISOString()
                    });
                }
            }

            // Add new value and maintain exactly 168 entries
            totalValueHistoric.push({
                value: totalValue,
                timestamp: new Date().toISOString()
            });

            // Keep only last 168 entries
            if (totalValueHistoric.length > 168) {
                totalValueHistoric = totalValueHistoric.slice(-168);
            }

            // Update total value historic
            const { error: updateError2 } = await this.supabase
                .from('users')
                .update({ total_value_historic: totalValueHistoric })
                .eq('wallet_address', user.wallet_address);

            if (updateError2) {
                return { 
                    exitCode: 500, 
                    message: `Error updating total value: ${updateError2.message}` 
                };
            }
        }

        return { exitCode: 200, message: 'Token balances updated successfully' };
    }
}