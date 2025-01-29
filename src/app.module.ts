// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AlchemyModule } from './alchemy/alchemy.module';
import { FrankfurterService } from './frankfurter/frankfurter.service';
import { FrankfurterModule } from './frankfurter/frankfurter.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AlchemyModule,
    FrankfurterModule,
  ],
  controllers: [AppController],
  providers: [AppService, FrankfurterService],
})
export class AppModule {}