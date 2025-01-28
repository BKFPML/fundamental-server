import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { AlchemyService } from '../../src/alchemy/alchemy.service';

const alchemyService = new AlchemyService(new ConfigService());

export default async (req: Request) => {
    try {
        const { next_run } = await req.json();
        console.log("Received event! Next invocation at:", next_run);

        const data = await alchemyService.getCurrenciesPrice();

        if (!data) {
            return new Response(
                JSON.stringify({ error: 'Balance not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return {
            statusCode: 200,
            body: JSON.stringify({ data }),
        };
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
