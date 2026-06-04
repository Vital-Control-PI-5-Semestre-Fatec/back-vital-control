import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MedicationsModule } from '../medications/medications.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [DatabaseModule, MedicationsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
