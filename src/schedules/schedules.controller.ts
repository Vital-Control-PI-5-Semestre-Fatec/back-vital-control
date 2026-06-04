import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsDateString, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { SchedulesService } from './schedules.service';

class CreateScheduleDto {
  @IsString() medicationId: string;
  @IsString() title: string;
  @IsObject() dose: { quantity: number; unit: string };
  @IsArray() @IsString({ each: true }) times: string[];
  @IsObject() recurrence: Record<string, unknown>;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() instructions?: string;
}
class OccurrenceDto { @IsDateString() scheduledFor: string; }
class CompleteDto { @IsOptional() @IsString() notes?: string; }

@Controller('patients/:patientId')
export class SchedulesController {
  constructor(private readonly service: SchedulesService, private readonly access: AccessService) {}
  @Get('schedules') async list(@Param('patientId') id: string, @CurrentUser() user: AuthUser) { await this.access.assertPatientReadAccess(user, id); return this.service.list(id); }
  @Roles(UserRole.PATIENT) @Post('schedules') create(@Param('patientId') id: string, @Body() body: CreateScheduleDto, @CurrentUser() user: AuthUser) { this.access.assertPatientWriteAccess(user, id); return this.service.create(id, body); }
  @Get('administrations') async history(@Param('patientId') id: string, @CurrentUser() user: AuthUser) { await this.access.assertPatientReadAccess(user, id); return this.service.history(id); }
  @Roles(UserRole.PATIENT) @Post('schedules/:scheduleId/occurrences') occurrence(@Param('patientId') id: string, @Param('scheduleId') scheduleId: string, @Body() body: OccurrenceDto, @CurrentUser() user: AuthUser) { this.access.assertPatientWriteAccess(user, id); return this.service.createOccurrence(id, scheduleId, new Date(body.scheduledFor)); }
  @Roles(UserRole.PATIENT, UserRole.CAREGIVER) @Patch('administrations/:administrationId/take') async take(@Param('patientId') id: string, @Param('administrationId') administrationId: string, @Body() body: CompleteDto, @CurrentUser() user: AuthUser) { await this.access.assertPatientReadAccess(user, id); if (user.role === UserRole.CAREGIVER) await this.service.assertCaregiverHasActiveVisit(id, user.userId); return this.service.complete(id, administrationId, body, user); }
}
