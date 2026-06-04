import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({ imports: [DatabaseModule], controllers: [MedicationsController], providers: [MedicationsService], exports: [MedicationsService] })
export class MedicationsModule {}
