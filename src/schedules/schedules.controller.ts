import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { SchedulesService } from './schedules.service';

class CreateScheduleDto {
  @IsString()
  medicationId!: string;

  @IsString()
  title!: string;

  @IsObject()
  dose!: { quantity: number; unit: string };

  @IsArray()
  @IsString({ each: true })
  times!: string[];

  @IsObject()
  recurrence!: Record<string, unknown>;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  medicationId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  dose?: { quantity: number; unit: string };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  times?: string[];

  @IsOptional()
  @IsObject()
  recurrence?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

class OccurrenceDto {
  @IsDateString()
  scheduledFor!: string;
}

class UpdateStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  justification?: string;
}

@Controller('patients/:patientId')
export class SchedulesController {
  constructor(
    private readonly service: SchedulesService,
    private readonly access: AccessService,
  ) {}

  @Get('schedules')
  async list(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    await this.access.assertPatientReadAccess(user, patientId);
    return this.service.list(patientId);
  }

  @Roles(UserRole.PATIENT)
  @Post('schedules')
  async create(
    @Param('patientId') patientId: string,
    @Body() body: CreateScheduleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.create(patientId, body);
  }

  @Roles(UserRole.PATIENT)
  @Patch('schedules/:scheduleId')
  async update(
    @Param('patientId') patientId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.update(patientId, scheduleId, body);
  }

  @Roles(UserRole.PATIENT)
  @Patch('schedules/:scheduleId/deactivate')
  async deactivate(
    @Param('patientId') patientId: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.deactivate(patientId, scheduleId);
  }

  @Get('administrations')
  async history(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    await this.access.assertPatientReadAccess(user, patientId);
    return this.service.history(patientId);
  }

  @Roles(UserRole.PATIENT)
  @Post('schedules/:scheduleId/occurrences')
  async occurrence(
    @Param('patientId') patientId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() body: OccurrenceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.createOccurrence(
      patientId,
      scheduleId,
      new Date(body.scheduledFor),
    );
  }

  @Roles(UserRole.PATIENT, UserRole.CAREGIVER)
  @Patch('administrations/:administrationId/status')
  async updateStatus(
    @Param('patientId') patientId: string,
    @Param('administrationId') administrationId: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    await this.access.assertPatientReadAccess(user, patientId);

    if (user.role === UserRole.CAREGIVER) {
      await this.service.assertCaregiverHasActiveVisit(patientId, user.userId);
    }

    return this.service.updateStatus(patientId, administrationId, body, user);
  }
}
