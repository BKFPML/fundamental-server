import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '@nestjs/common';

@Injectable()
export class EtherscanService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;
  public supabase: any;


  constructor(
    private readonly configService: ConfigService
  ) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL'); // Récupération de l'URL Supabase
    this.supabaseKey = this.configService.get<string>('SUPABASE_KEY'); // Récupération de la clé Supabase
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase
    this.apiKey = this.configService.get<string>('ETHERSCAN_API_KEY');
    this.apiUrl = this.configService.get<string>('ETHERSCAN_API_URL');
  }

  /**
   * Récupère les transactions d'une adresse Ethereum depuis Etherscan.
   * @param address L'adresse Ethereum à interroger.
   * @returns Une promesse contenant la liste des transactions.
   */
  public async updateWalletTransactions(address: string) {
    const url = `${this.apiUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${this.apiKey}`;
    const res = await axios.get(url);

    if (res.data.status !== '1') {
      return;
    }

    const allTokenTxs = res.data.result;

    const { data: tokens, error } = await this.supabase
      .from('token_list')
      .select('address');

    if (error || !tokens) {
      throw new Error('Erreur Supabase lors de la récupération des tokens');
    }

    const whitelist = tokens.map(t => t.address.toLowerCase());

    const filteredTxs = allTokenTxs.filter((tx: any) =>
      whitelist.includes(tx.contractAddress.toLowerCase()) && tx.functionName === 'transfer(address recipient,uint256 amount)'
    );

    const toInsert = filteredTxs.map((tx: any) => ({
      id: tx.hash + '-' + tx.logIndex, // id unique si tu veux (logIndex différencie tx multiples)
      from: tx.from,
      to: tx.to,
      token_address: tx.contractAddress,
      value: tx.value,
      gas: tx.gas,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
    }));

    // Insertion par batch (limite à 1000 max par requête)
    const { error: insertError } = await this.supabase
      .from('token_transactions')
      .upsert(toInsert, { onConflict: ['id'] }); // évite doublons

    if (insertError) {
      throw new Error('Erreur lors de l\'insertion dans Supabase: ' + insertError.message);
    }
    return;
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Met à jour les transactions d'un portefeuille Ethereum.
   * @param address L'adresse du portefeuille à mettre à jour.
   * @returns Une promesse qui se résout lorsque les transactions sont mises à jour.
   */

  public async updateAllWalletTransactions(): Promise<void> {
    const { data: user, error: error_user } = await this.supabase
      .from('users')
      .select('wallet_address');

    if (error_user) {
      throw new Error(`Error fetching wallet: ${error_user.message}`);
    }

    if (!user || user.length === 0) {
      throw new Error('No wallets found in the database.');
    }

    const addresses = user.map(u => u.wallet_address);

    for (let i = 0; i < addresses.length; i++) {
      await this.updateWalletTransactions(addresses[i]);
      if (i < addresses.length - 1) {
        await this.sleep(250); // attend 250 ms avant la prochaine requête
      }
    }

    Logger.log('All wallet transactions updated successfully.');
    return;
  }
}
