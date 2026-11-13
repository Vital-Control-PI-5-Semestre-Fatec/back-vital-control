import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, UserRole } from '../common/auth';
import { AuditService } from './audit.service';
import { AuditLog } from '../database/schemas';

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.CARE_MANAGER)
  async listLogs(
    @Query('actorUserId') actorUserId?: string,
    @Query('patientId') patientId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditLog[]> {
    return this.auditService.list({
      actorUserId,
      patientId,
      resourceType,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}

