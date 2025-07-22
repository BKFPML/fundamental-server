import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';

const databaseService = new DatabaseService(new ConfigService());

export default async (req: Request) => {
        const { next_run } = await req.json();
        console.log("Received event! Next invocation at:", next_run);

        const status = await databaseService.saveCurrentProductionDatabaseToDevelopment();

        return new Response(
            JSON.stringify({ message: status.message }),
            {
                status: status.exitCode,
                headers: { 'Content-Type': 'application/json' }
            }
        );
}

export const config: Config = {
    schedule: "@daily",
};
