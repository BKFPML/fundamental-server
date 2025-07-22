import type { Config } from "@netlify/functions";
import { ConfigService } from '@nestjs/config';
import { EtherscanService } from '../../src/etherscan/etherscan.service';

const ethersService = new EtherscanService(new ConfigService());

export default async (req: Request) => {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);

    console.log("Starting token price update...");
    const status = await ethersService.updateAllWalletTransactions();
    console.log("Token price update completed.");

    return new Response(
        JSON.stringify({ message: status.message }),
        { status: status.exitCode, headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
        }
    );

};

export const config: Config = {
    schedule: "*/5 * * * *"
};
