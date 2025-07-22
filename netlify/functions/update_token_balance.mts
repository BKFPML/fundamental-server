import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { AlchemyService } from '../../src/alchemy/alchemy.service';

const alchemyService = new AlchemyService(new ConfigService());

export default async (req: Request) => {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);

    const status = await alchemyService.updateTokenBalances();

    return new Response(
        JSON.stringify({ message: status.message }),
        { status: status.exitCode, headers: { 'Content-Type': 'application/json' } }
    );
};

export const config: Config = {
    schedule: "*/15 * * * *"
};
