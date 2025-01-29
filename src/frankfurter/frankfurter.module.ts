import { Module } from '@nestjs/common';
import { FrankfurterController } from './frankfurter.controller';
import { FrankfurterService } from './frankfurter.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [FrankfurterController],
  providers: [FrankfurterService],
  imports: [ConfigModule],
})
export class FrankfurterModule {}
