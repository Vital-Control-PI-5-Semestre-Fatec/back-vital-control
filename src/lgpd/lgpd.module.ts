import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { LgpdService } from './lgpd.service';
import { LgpdController } from './lgpd.controller';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [LgpdController],
  providers: [LgpdService],
  exports: [LgpdService],
})
export class LgpdModule {}

