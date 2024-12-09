import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { log } from 'console';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kilqtdrtuaxyoxkethsv.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    
            if (!metadata) {
                throw new Error('Token metadata not found');
            }
    
            // Vérification et insertion dans la base Supabase
            const { data: tokenData, error } = await supabase
                .from('crypto_list')
                .select('crypto_name')
                .eq('crypto_name', metadata.name);
    
            if (error) {
                Logger.error('Error querying Supabase:', JSON.stringify(error, null, 2));

            }
            Logger.log("Token Data:", tokenData);
            if (!tokenData || tokenData.length === 0) {
                const { error: insertError } = await supabase
                    .from('crypto_list')
                    .insert([{ crypto_name: metadata.name, symbol: metadata.symbol, decimal: metadata.decimals }])
                    .select();
    
                if (insertError) {
                    Logger.error('Error inserting into Supabase:', insertError);
                }
            }
    
            return {
                name: metadata.name || 'Nom indisponible',
                symbol: metadata.symbol || 'Symbole indisponible',
                decimals: metadata.decimals || 0,
            };
        } catch (error) {
            Logger.error('Error fetching token metadata:', error);
            throw error;
        }
    }
    
    public async getTokenBalances(address: string): Promise<any[]> {
        const network = "base";
        const Url = `https://${network}-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        const data = {
            jsonrpc: '2.0',
            method: 'alchemy_getTokenBalances',
            params: [address],
            id: 1,
        };
    
        try {
            const response = await axios.post(Url, data);
            const balances = response.data.result.tokenBalances;
            Logger.log(balances);
            const answer = [];

            for (const balance of balances) {
                // Récupération des données depuis Supabase
                const { data: addressData, error } = await supabase
                    .from('adress_data')
                    .select('crypto_name_link, symbol, decimal')
                    .eq('wallet_adress', balance.contractAddress);

                if (error) {
                    Logger.error('Error querying Supabase:', JSON.stringify(error, null, 2));
                }

                let tokenMetadata = addressData && addressData.length > 0 ? addressData[0] : null;

                if (!tokenMetadata) {
                    Logger.log("Calling getTokenMetadata");
                    const metadata = await this.getTokenMetadata(balance.contractAddress);
                    balance.tokenBalance = balance.tokenBalance.toString();
                    const { error: insertError } = await supabase
                        .from('adress_data')
                        .insert([{
                            wallet_adress: balance.contractAddress,
                            crypto_name_link: metadata.name,
                            symbol: metadata.symbol,
                            decimal: metadata.decimals,
                        }])
                        .select();

                    if (insertError) {
                        Logger.error('Error inserting into Supabase:', JSON.stringify(insertError, null, 2));
                    }

                    tokenMetadata = metadata;
                }
    
                // Ajout des données au résultat
                answer.push({
                    asset: balance.contractAddress,
                    name: tokenMetadata.crypto_name_link,
                    symbol: tokenMetadata.symbol,
                    value: balance.tokenBalance,
                    decimal: tokenMetadata.decimal,
                });
            }
    
            return answer;
        } catch (error) {
            Logger.error('Error fetching token balances:', error);
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
}
