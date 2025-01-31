import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { AlchemyService } from '../../src/alchemy/alchemy.service';

const alchemyService = new AlchemyService(new ConfigService());

export default async (req: Request) => {
    try {
        const { next_run } = await req.json();
        console.log("Received event! Next invocation at:", next_run);

        const {result} = await alchemyService.updateTokenPriceInDollars();

        return new Response(
            JSON.stringify({ message: "Token prices updated successfully", result }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error processing request:', error.message);
        return new Response(
            JSON.stringify({ error: 'Internal Server Error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const config: Config = {
    schedule: "*/10 * * * *"
};
