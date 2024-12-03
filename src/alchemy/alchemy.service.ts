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
}
