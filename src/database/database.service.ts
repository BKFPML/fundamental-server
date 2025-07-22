import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Status } from '../../template/type';
@Injectable()
export class DatabaseService {
    private readonly supabaseUrl: string;
    private readonly supabaseKey: string;
    public supabaseProd: any;
    public supabaseDev: any;
    public supabaseBackup: any;

    constructor(
        private readonly configService: ConfigService
    ) {
        this.supabaseUrl = this.configService.get<string>('SUPABASE_URL'); // Récupération de l'URL Supabase
        this.supabaseKey = this.configService.get<string>('SUPABASE_KEY'); // Récupération de la clé Supabase
        this.supabaseProd = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase

        this.supabaseUrl = this.configService.get<string>('SUPABASE_URL_DEV'); // Récupération de l'URL Supabase
        this.supabaseKey = this.configService.get<string>('SUPABASE_KEY_DEV'); //
        this.supabaseDev = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase

        // this.supabaseUrl = this.configService.get<string>('SUPABASE_URL_BACKUP'); // Récupération de l'URL Supabase
        // this.supabaseKey = this.configService.get<string>('SUPABASE_KEY_BACKUP'); // Récupération de la clé Supabase
        // this.supabaseBackup = createClient(this.supabaseUrl, this.supabaseKey); // Création du client Supabase
    }

    async saveCurrentProductionDatabaseToDevelopment(): Promise<Status> {
        const tables = [
            { name: 'users', conflictKey: 'id' },
            { name: 'user_feedback', conflictKey: 'id' },
            { name: 'waitlist', conflictKey: 'id' },
            { name: 'token_transactions', conflictKey: 'id' },
            { name: 'token_list', conflictKey: 'address' }
        ];

        for (const table of tables) {
            // 1. Supprimer toutes les lignes de la table de dev
            const { error: deleteError } = await this.supabaseDev
                .from(table.name)
                .delete()
                .not(table.conflictKey, 'is', null);


            if (deleteError) {
                return { exitCode: 500, message: `Error deleting ${table.name} from development: ${deleteError.message}` };
            }

            // 2. Récupérer les données de production
            const { data, error: fetchError } = await this.supabaseProd
                .from(table.name)
                .select('*');

            if (fetchError) {
                return { exitCode: 500, message: `Error fetching ${table.name} from production: ${fetchError.message}` };
            }

            // 3. Réinsérer les données dans dev
            const { error: upsertError } = await this.supabaseDev
                .from(table.name)
                .upsert(data, {
                    onConflict: table.conflictKey
                });

            if (upsertError) {
                return { exitCode: 500, message: `Error inserting ${table.name} into development: ${upsertError.message}` };
            }
        }
        return { exitCode: 200, message: 'Database successfully updated from production to development' };
    }




    // TO USE WHEN WE WILL HAVE A BACKUP DATABASE
    async saveCurrentProductionDatabaseToBackup(): Promise<void> {
        // USER backup
        const { data: users, error: usersError } = await this.supabaseProd.from('users').select('*');
        if (usersError) {
            throw new Error(`Error fetching users from production: ${usersError.message}`);
        }
        const { error: insertUsersError } = await this.supabaseBackup.from('users').insert(users);
        if (insertUsersError) {
            throw new Error(`Error inserting users into backup: ${insertUsersError.message}`);
        }

        // USER_FEEDBACK backup
        const { data: userFeedback, error: userFeedbackError } = await this.supabaseProd.from('user_feedback').select('*');
        if (userFeedbackError) {
            throw new Error(`Error fetching user feedback from production: ${userFeedbackError.message}`);
        }
        const { error: insertUserFeedbackError } = await this.supabaseBackup.from('user_feedback').insert(userFeedback);
        if (insertUserFeedbackError) {
            throw new Error(`Error inserting user feedback into backup: ${insertUserFeedbackError.message}`);
        }

        // WAITLIST backup
        const { data: waitlist, error: waitlistError } = await this.supabaseProd.from('waitlist').select('*');
        if (waitlistError) {
            throw new Error(`Error fetching waitlist from production: ${waitlistError.message}`);
        }
        const { error: insertWaitlistError } = await this.supabaseBackup.from('waitlist').insert(waitlist);
        if (insertWaitlistError) {
            throw new Error(`Error inserting waitlist into backup: ${insertWaitlistError.message}`);
        }

        // TOKEN_TRANSACTIONS backup
        const { data: tokenTransactions, error: tokenTransactionsError } = await this.supabaseProd.from('token_transactions').select('*');
        if (tokenTransactionsError) {
            throw new Error(`Error fetching token transactions from production: ${tokenTransactionsError.message}`);
        }
        const { error: insertTokenTransactionsError } = await this.supabaseBackup.from('token_transactions').insert(tokenTransactions);
        if (insertTokenTransactionsError) {
            throw new Error(`Error inserting token transactions into backup: ${insertTokenTransactionsError.message}`);
        }
    }
}
