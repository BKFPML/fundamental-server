import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Wallet,
  JsonRpcProvider,
  Mnemonic,
  HDNodeWallet,
  formatEther,
  parseEther,
  parseUnits
} from "ethers";
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class EthersService {
    private readonly supabaseUrl: string;
    private readonly supabaseKey: string;
    public supabase: any;
    private readonly hotWalletPrivateKey: string;
    private readonly rpcUrl: string;

    constructor(
            private readonly configService: ConfigService
        ) {
            this.supabaseUrl = this.configService.get<string>('SUPABASE_URL'); // Récupération de l'URL Supabase
            this.supabaseKey = this.configService.get<string>('SUPABASE_KEY'); // Récupération de la clé Supabase
            this.supabase = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase
            this.hotWalletPrivateKey = this.configService.get<string>('HOT_WALLET_PRIVATE_KEY');
            this.rpcUrl = this.configService.get<string>('BASE_RPC_URL');
        }

    async addFeesMoneyToWallet(address: string): Promise<void> {
        // Vérification si l'adresse est dans la base de données et quelle possède moins de 0.01 cents of ETH
        let needsFunding = false;
        const { data: tokens, error: error_token } = await this.supabase
            .from('token_list')
            .select('last_value')
            .eq('address', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'); // Adresse du token ETH

        if (error_token) {
            throw new Error(`Error fetching token: ${error_token.message}`);
        }

        if (!tokens || !tokens[0].last_value) {
            throw new Error(
                `Token with address 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee not found in the database.`
            );
        }

        const { data: user, error: error_user } = await this.supabase
            .from('users')
            .select('balances')
            .eq('wallet_address', address);

        // check if there is an error
        if (error_user) {
            throw new Error(`Error fetching wallet: ${error_user.message}`);
        } else if (!user) {
            throw new Error(`Wallet with address ${address} not found in the database.`);
        }
        // Check if the balance is less than 0.01 ETH
        user[0].balances.map((balance: any) => {
            if (balance.address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
                if (balance.value < 0.01) {
                    needsFunding = true;
                }
            }
        });

        // If the wallet already has sufficient funds, we do not need to fund it
        if (!needsFunding) {
            console.log(`Wallet ${address} already has sufficient funds.`);
            return;
        }

        const provider = new JsonRpcProvider(this.rpcUrl);
        const hotWallet = new Wallet(this.hotWalletPrivateKey, provider);

        // Détermine le montant à envoyer en ETH (~0.05 €)
        const amountInEth = 0.05 / tokens[0].last_value; // ≈ 0.000016 ETH

        // Préparer et envoyer la transaction
        const tx = await hotWallet.sendTransaction({
            to: address,
            value: parseEther(amountInEth.toFixed(8)), // arrondi à 8 décimales
        });

        await tx.wait();
        console.log(`✅ Envoyé ${amountInEth} ETH à ${address} : ${tx.hash}`);
    }
}
