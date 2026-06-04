import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HomeVisitsController } from './home-visits.controller';

@Module({ imports: [DatabaseModule], controllers: [HomeVisitsController] })
export class HomeVisitsModule {}
