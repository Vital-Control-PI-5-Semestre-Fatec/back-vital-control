import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PatientsController } from './patients.controller';

@Module({ imports: [DatabaseModule, AuditModule], controllers: [PatientsController] })
export class PatientsModule {}
