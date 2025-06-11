import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Wallet,
  JsonRpcProvider,
  parseEther
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
            const pk = this.configService.get<string>('HOT_WALLET_PRIVATE_KEY');
            this.hotWalletPrivateKey = pk.startsWith('0x') ? pk : '0x' + pk;
            this.rpcUrl = this.configService.get<string>('BASE_RPC_URL');
        }

    /**
     * Ajoute des fonds à un portefeuille Ethereum si son solde est inférieur à 0.05 cents d'ETH.
     * @param address L'adresse du portefeuille à alimenter.
     * @returns Une promesse qui se résout lorsque les fonds sont ajoutés.
     * @throws Une erreur si l'adresse n'est pas trouvée dans la base de données ou si une erreur se produit lors de la récupération des données.
     * @throws Une erreur si le token ETH n'est pas trouvé dans la base de données.
     * @throws Une erreur si le portefeuille a déjà suffisamment de fonds.
     * @throws Une erreur si une erreur se produit lors de l'envoi de la transaction.
     * @description Cette méthode vérifie si le portefeuille a moins de 0.01 cents d'ETH. Si c'est le cas, elle envoie environ 0.05 € d'ETH à l'adresse spécifiée.
    */
    async addFeesMoneyToWallet(address: string): Promise<void> {
        // Vérification si l'adresse est dans la base de données et quelle possède moins de 0.01 cents of ETH
        // let needsFunding = false;
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
            .select('balances, gas_sponsored')
            .eq('wallet_address', address);

        // check if there is an error
        if (error_user) {
            console.log(`Error fetching wallet: ${error_user.message}`);
            throw new Error(`Error fetching wallet: ${error_user.message}`);
        } else if (!user) {
            console.log(`Wallet with address ${address} not found in the database.`);
            throw new Error(`Wallet with address ${address} not found in the database.`);
        }
        // Check if the balance is less than 0.01 ETH
        // user[0].balances.map((balance: any) => {
        //     if (balance.address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        //         if (balance.value < 0.01) {
        //             needsFunding = true;
        //         }
        //     }
        // });

        // If the wallet already has sufficient funds, we do not need to fund it
        // if (!needsFunding) {
        //     console.log(`Wallet ${address} already has sufficient funds.`);
        //     return;
        // }

        // Check if the balance already gets sponsored
        if (user[0].gas_sponsored) {
            console.log(`Wallet ${address} already has gas sponsored.`);
            return;
        }

        await this.supabase
            .from('users')
            .update({ gas_sponsored: true })
            .eq('wallet_address', address);
        console.log(`Wallet ${address} has been marked as gas sponsored.`);

        console.log(`Hot wallet PK starts with: ${this.hotWalletPrivateKey.slice(0, 12)}`);
        console.log('rpcUrl starts with: ' + this.rpcUrl.slice(0, 12));

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
