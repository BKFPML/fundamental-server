import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class FrankfurterService {
    private readonly supabase: any;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    private generateDateRange(startDate: string, endDate: string): string[] {
        const dates: string[] = [];
        const currentDate = new Date(startDate);
        const end = new Date(endDate);

        while (currentDate <= end) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
    }

    private fillMissingData(rates: Record<string, Record<string, number>>, startDate: string, endDate: string) {
        const filledRates: Record<string, Record<string, number>> = {};
        const dateRange = this.generateDateRange(startDate, endDate);
        let lastKnownRate: Record<string, number> | null = null;

        for (const date of dateRange) {
            if (rates[date]) {
                lastKnownRate = rates[date];
            }
            if (lastKnownRate) {
                filledRates[date] = lastKnownRate;
            }
        }

        return filledRates;
    }

    private getDateRange(): { startDate: string; endDate: string } {
        const now = new Date();
        const startDate = now.toISOString().split('T')[0];

        now.setFullYear(now.getFullYear() - 1);
        const endDate = now.toISOString().split('T')[0];

        return { startDate, endDate };
    }

    private formatRates(rates: Record<string, Record<string, number>>): { value: number; timestamp: string }[] {
        return Object.entries(rates).flatMap(([timestamp, currencyRates]) =>
            Object.values(currencyRates).map((value) => ({ value, timestamp }))
        );
    }

    public async getCurrenciesHistoricPrice(symbol: string): Promise<void> {
        try {
            const { startDate, endDate } = this.getDateRange();
            const url = `https://api.frankfurter.dev/v1/${endDate}..${startDate}?base=USD&symbols=${symbol}`;

            const { data } = await axios.get(url, { headers: { Accept: 'application/json' } });
            if (!data?.rates) throw new Error('Invalid API response: No rates data');

            const filledRates = this.fillMissingData(data.rates, endDate, startDate);
            const formattedRates = this.formatRates(filledRates);
            Logger.log(formattedRates);
            const { error } = await this.supabase.from('exchange_rate').update({ value: formattedRates }).eq('symbol', symbol);
            if (error) throw new Error(`Error updating exchange rates: ${error.message}`);
        } catch (error) {
            Logger.error(`Error fetching or updating currency prices: ${error.message}`);
            throw error;
        }
    }

    public async updateCurrencyPrice() {
        const {data: currencies, error} = await this.supabase.from('exchange_rate').select('symbol, value');
        if (error) throw new Error(`Error fetching currencies: ${error.message}`);

        let url = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=';
        for (const currency of currencies) {
            if (currency.symbol === 'USD') continue;
            url += `${currency.symbol},`;
        }

        const { data } = await axios.get(url, { headers: { Accept: 'application/json' } });
        if (!data?.rates) throw new Error('Invalid API response: No rates data');

        for (const currency of currencies) {
            const rate = data.rates[currency.symbol];
            if (!rate) continue;

            const { error } = await this.supabase.from('exchange_rate').update({ value: currency.value.slice(1).concat({ value: rate, timestamp: new Date().toISOString().split('T')[0]})}).eq('symbol', currency.symbol);
            if (error) throw new Error(`Error updating exchange rates: ${error.message}`);
        }
    }
}
