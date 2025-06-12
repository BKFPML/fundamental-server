import { DatabaseService } from './database.service';
import { Controller, Get} from '@nestjs/common';

@Controller('database')
export class DatabaseController {
    constructor(private readonly databaseService: DatabaseService) {}

    // Endpoint to save the current production database to development
    @Get('save-current-production-to-development')
    async saveCurrentProductionDatabaseToDevelopment() {
        await this.databaseService.saveCurrentProductionDatabaseToDevelopment();
    }

    // Endpoint to save the current production database to backup
    @Get('save-current-production-to-backup')
    async saveCurrentProductionDatabaseToBackup() {
        await this.databaseService.saveCurrentProductionDatabaseToBackup();
    }
}
