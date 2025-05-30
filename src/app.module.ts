// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AlchemyModule } from './alchemy/alchemy.module';
import { FrankfurterService } from './frankfurter/frankfurter.service';
import { FrankfurterModule } from './frankfurter/frankfurter.module';
import { EthersModule } from './ethers/ethers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AlchemyModule,
    FrankfurterModule,
    EthersModule,
  ],
  controllers: [AppController],
  providers: [AppService, FrankfurterService],
})
export class AppModule {}