import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { mapPatientProfile } from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';

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
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get(':patientId/profile')
  async find(@Param('patientId') patientId: string, @CurrentUser() user: AuthUser) {
    await this.access.assertPatientReadAccess(user, patientId);
    const cleanPatientId = this.access.objectId(patientId);

    const { data } = await this.supabase.client
      .from('patient_profiles')
      .select('*')
      .eq('patient_id', cleanPatientId)
      .maybeSingle();

    void this.audit.record({
      actorUserId: this.access.objectId(user.userId),
      patientId: cleanPatientId,
      action: 'READ',
      resourceType: 'patient_profiles',
    });

    return data ? mapPatientProfile(data) : null;
  }

  @Roles(UserRole.PATIENT)
  @Put(':patientId/profile')
  async upsert(
    @Param('patientId') patientId: string,
    @Body() body: PatientProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.access.assertPatientWriteAccess(user, patientId);
    const cleanPatientId = this.access.objectId(patientId);

    const payload: Record<string, unknown> = {
      patient_id: cleanPatientId,
    };

    if (body.bloodType !== undefined) payload.blood_type = body.bloodType;
    if (body.weightKg !== undefined) payload.weight_kg = body.weightKg;
    if (body.heightCm !== undefined) payload.height_cm = body.heightCm;
    if (body.allergies !== undefined) payload.allergies = body.allergies;
    if (body.preExistingConditions !== undefined) {
      payload.pre_existing_conditions = body.preExistingConditions;
    }
    if (body.defaultAddress !== undefined) payload.default_address = body.defaultAddress;
    if (body.emergencyContacts !== undefined) payload.emergency_contacts = body.emergencyContacts;
    if (body.timezone !== undefined) payload.timezone = body.timezone;

    const { data, error } = await this.supabase.client
      .from('patient_profiles')
      .upsert(payload, { onConflict: 'patient_id' })
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Erro ao salvar perfil do paciente');
    }

    const result = mapPatientProfile(data);
    void this.audit.record({
      actorUserId: this.access.objectId(user.userId),
      patientId: cleanPatientId,
      action: 'UPDATE',
      resourceType: 'patient_profiles',
      resourceId: result.id,
    });
    return result;
  }
}