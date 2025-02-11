import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { FrankfurterService } from '../../src/frankfurter/frankfurter.service';

const frankfurterService = new FrankfurterService(new ConfigService());

export default async (req: Request) => {
    try {
        const { next_run } = await req.json();
        console.log("Received event! Next invocation at:", next_run);

        await frankfurterService.updateCurrencyPrice();

        return new Response(
            JSON.stringify({ message: "Currency prices updated successfully"}),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
