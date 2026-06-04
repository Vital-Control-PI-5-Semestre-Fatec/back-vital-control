import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { PatientProfile } from '../database/schemas';

class PatientProfileDto {
  @IsOptional() @IsString() bloodType?: string;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) preExistingConditions?: string[];
  @IsOptional() @IsObject() defaultAddress?: Record<string, string>;
  
  @IsOptional() @IsArray() emergencyContacts?: Record<string, string>[];
  
  @IsOptional() @IsString() timezone?: string;
}

@Controller('patients')
export class PatientsController {
  constructor(
    @InjectModel(PatientProfile.name) private readonly profiles: Model<PatientProfile>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get(':patientId/profile')
  async find(@Param('patientId') patientId: string, @CurrentUser() user: AuthUser) {
    await this.access.assertPatientReadAccess(user, patientId);
    const result = await this.profiles.findOne({ patientId });
    void this.audit.record({ actorUserId: this.access.objectId(user.userId), patientId: this.access.objectId(patientId), action: 'READ', resourceType: 'patient_profiles' });
    return result;
  }

  @Roles(UserRole.PATIENT)
  @Put(':patientId/profile')
  async upsert(@Param('patientId') patientId: string, @Body() body: PatientProfileDto, @CurrentUser() user: AuthUser) {
    this.access.assertPatientWriteAccess(user, patientId);
    const result = await this.profiles.findOneAndUpdate({ patientId }, body, { upsert: true, new: true, runValidators: true });
    void this.audit.record({ actorUserId: this.access.objectId(user.userId), patientId: this.access.objectId(patientId), action: 'UPDATE', resourceType: 'patient_profiles', resourceId: result._id });
    return result;
  }
}