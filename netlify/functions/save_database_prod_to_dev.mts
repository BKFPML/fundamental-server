import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';

const databaseService = new DatabaseService(new ConfigService());

export default async (req: Request) => {
    try {
        const { next_run } = await req.json();
        console.log("Received event! Next invocation at:", next_run);

        await databaseService.saveCurrentProductionDatabaseToDevelopment();

        return new Response(
            JSON.stringify({ message: 'Production database successfully copied to development environment.' }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        console.error('Error processing request:', error.message);
        return new Response(
            JSON.stringify({ error: 'Internal Server Error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

export const config: Config = {
    schedule: "@daily",
};
