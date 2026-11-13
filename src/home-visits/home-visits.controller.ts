import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { formatNameInitials, HomeVisit, mapCareGroup, mapHomeVisit } from '../database/schemas';
import { isValidUuid, SupabaseService } from '../database/supabase.service';

const activeGroupFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };

class RequestVisitDto {
  @IsString() reason: string;
  @IsOptional() @IsString() patientNotes?: string;
  @IsObject() requestedWindow: { start: string; end: string };
  @IsObject() addressSnapshot: Record<string, string>;
  @IsOptional() @IsString() patientId?: string;
}

class EditVisitDto {
  @IsOptional() @IsString() reason?: string;
}

class AssignVisitDto {
  @IsString() careGroupId: string;
  @IsString() assignedCaregiverId: string;
  @IsObject() scheduledWindow: { start: string; end: string };
}

class StatusDto {
  @IsString() status: string;
  @IsOptional() @IsString() caregiverNotes?: string;
}

class CancelVisitDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() caregiverNotes?: string;
}

@Controller('home-visits')
export class HomeVisitsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Roles(UserRole.PATIENT, UserRole.RESPONSIBLE)
  @Post()
  async request(@Body() body: RequestVisitDto, @CurrentUser() user: AuthUser) {
    let patientId: string;

    if (user.role === UserRole.RESPONSIBLE) {
      if (!body.patientId) {
        throw new BadRequestException('Paciente obrigatório para responsável');
      }
      patientId = this.objectId(body.patientId, 'Paciente inválido');
      await this.assertResponsiblePatientAccess(user.userId, patientId);
    } else {
      patientId = this.objectId(user.userId, 'Paciente inválido');
    }

    const { data: visitRow, error } = await this.supabase.client
      .from('home_visits')
      .insert({
        patient_id: patientId,
        reason: body.reason,
        patient_notes: body.patientNotes ?? null,
        requested_window: body.requestedWindow,
        address_snapshot: body.addressSnapshot,
        status: 'REQUESTED',
      })
      .select()
      .single();

    if (error || !visitRow) {
      throw new BadRequestException(error?.message ?? 'Erro ao solicitar atendimento');
    }

    const visit = mapHomeVisit(visitRow);
    await this.supabase.client.from('home_visit_events').insert({
      home_visit_id: visit.id,
      type: 'CREATED',
      performed_by_user_id: user.userId,
      details: {},
    });

    return (await this.enrichVisitsWithInitials([visit]))[0];
  }

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CARE_MANAGER) {
      const managerId = this.objectId(user.userId, 'Gerente inválido');
      const { data: groupRows } = await this.supabase.client
        .from('care_groups')
        .select('patient_ids')
        .eq('manager_id', managerId)
        .eq('status', 'ACTIVE');

      const patientIds = [
        ...new Set((groupRows ?? []).flatMap((group) => (group.patient_ids ?? []).map(String))),
      ];

      let orCondition = `manager_id.eq.${managerId}`;
      if (patientIds.length > 0) {
        orCondition += `,and(status.eq.REQUESTED,manager_id.is.null,patient_id.in.(${patientIds.join(',')}))`;
      }

      const { data: visits } = await this.supabase.client
        .from('home_visits')
        .select('*')
        .or(orCondition)
        .order('created_at', { ascending: false });

      return this.enrichVisitsWithInitials((visits ?? []).map(mapHomeVisit));
    }

    if (user.role === UserRole.RESPONSIBLE) {
      const responsibleId = this.objectId(user.userId, 'Responsável inválido');
      const { data: groupRows } = await this.supabase.client
        .from('care_groups')
        .select('patient_ids')
        .contains('responsible_ids', [responsibleId])
        .eq('status', 'ACTIVE');

      const patientIds = [
        ...new Set((groupRows ?? []).flatMap((group) => (group.patient_ids ?? []).map(String))),
      ];
      if (!patientIds.length) return [];

      const { data: visits } = await this.supabase.client
        .from('home_visits')
        .select('*')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false });

      return this.enrichVisitsWithInitials((visits ?? []).map(mapHomeVisit));
    }

    if (user.role === UserRole.PATIENT) {
      const patientId = this.objectId(user.userId, 'Paciente inválido');
      const { data: visits } = await this.supabase.client
        .from('home_visits')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      return this.enrichVisitsWithInitials((visits ?? []).map(mapHomeVisit));
    }

    if (user.role === UserRole.CAREGIVER) {
      const caregiverId = this.objectId(user.userId, 'Cuidador inválido');
      const { data: visits } = await this.supabase.client
        .from('home_visits')
        .select('*')
        .eq('assigned_caregiver_id', caregiverId)
        .order('created_at', { ascending: false });

      return this.enrichVisitsWithInitials((visits ?? []).map(mapHomeVisit));
    }

    return [];
  }

  @Roles(UserRole.PATIENT)
  @Put(':id')
  async edit(@Param('id') id: string, @Body() body: EditVisitDto, @CurrentUser() user: AuthUser) {
    const visitId = this.objectId(id, 'Atendimento inválido');
    const patientId = this.objectId(user.userId, 'Paciente inválido');

    const { data: existing } = await this.supabase.client
      .from('home_visits')
      .select('*')
      .eq('id', visitId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!existing) throw new BadRequestException('Atendimento não encontrado');
    if (existing.status !== 'REQUESTED') {
      throw new BadRequestException('Apenas solicitações em triagem podem ser editadas');
    }

    const updatePayload: Record<string, unknown> = {};
    if (body.reason) updatePayload.reason = body.reason;

    const { data: updated, error } = await this.supabase.client
      .from('home_visits')
      .update(updatePayload)
      .eq('id', visitId)
      .select()
      .single();

    if (error || !updated) {
      throw new BadRequestException('Erro ao atualizar atendimento');
    }

    await this.supabase.client.from('home_visit_events').insert({
      home_visit_id: visitId,
      type: 'EDITED',
      performed_by_user_id: user.userId,
      details: { ...body },
    });

    return (await this.enrichVisitsWithInitials([mapHomeVisit(updated)]))[0];
  }

  @Roles(UserRole.PATIENT, UserRole.RESPONSIBLE, UserRole.CARE_MANAGER)
  @Patch(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelVisitDto,
    @CurrentUser() user: AuthUser,
  ) {
    const visitId = this.objectId(id, 'Atendimento inválido');

    let allowedPatientIds: string[] = [];
    if (user.role === UserRole.RESPONSIBLE) {
      const responsibleId = this.objectId(user.userId, 'Responsável inválido');
      const { data: groupRows } = await this.supabase.client
        .from('care_groups')
        .select('patient_ids')
        .contains('responsible_ids', [responsibleId])
        .eq('status', 'ACTIVE');

      allowedPatientIds = [
        ...new Set((groupRows ?? []).flatMap((group) => (group.patient_ids ?? []).map(String))),
      ];
    } else if (user.role === UserRole.CARE_MANAGER) {
      const managerId = this.objectId(user.userId, 'Gerente inválido');
      const { data: groupRows } = await this.supabase.client
        .from('care_groups')
        .select('patient_ids')
        .eq('manager_id', managerId)
        .eq('status', 'ACTIVE');

      allowedPatientIds = [
        ...new Set((groupRows ?? []).flatMap((group) => (group.patient_ids ?? []).map(String))),
      ];
    } else {
      allowedPatientIds = [this.objectId(user.userId, 'Paciente inválido')];
    }

    if (!allowedPatientIds.length && user.role !== UserRole.CARE_MANAGER) {
      throw new BadRequestException('Atendimento não encontrado');
    }

    let query = this.supabase.client
      .from('home_visits')
      .select('*')
      .eq('id', visitId);

    if (user.role === UserRole.CARE_MANAGER) {
      const managerId = this.objectId(user.userId, 'Gerente inválido');
      const orFilter =
        allowedPatientIds.length > 0
          ? `manager_id.eq.${managerId},patient_id.in.(${allowedPatientIds.join(',')})`
          : `manager_id.eq.${managerId}`;
      query = query.or(orFilter);
    } else {
      query = query.in('patient_id', allowedPatientIds);
    }

    const { data: existing } = await query.maybeSingle();

    if (!existing) throw new BadRequestException('Atendimento não encontrado');
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new BadRequestException('Atendimento já finalizado ou cancelado');
    }
    if (
      user.role !== UserRole.CARE_MANAGER &&
      !['REQUESTED', 'TRIAGED', 'SCHEDULED'].includes(existing.status)
    ) {
      throw new BadRequestException('Atendimento já iniciado ou finalizado');
    }

    const cancelNote = body?.reason ?? body?.caregiverNotes;
    const updatePayload: Record<string, unknown> = { status: 'CANCELLED' };
    if (cancelNote !== undefined) {
      updatePayload.caregiver_notes = cancelNote;
    }

    const { data: updated, error } = await this.supabase.client
      .from('home_visits')
      .update(updatePayload)
      .eq('id', visitId)
      .select()
      .single();

    if (error || !updated) {
      throw new BadRequestException('Erro ao cancelar atendimento');
    }

    await this.supabase.client.from('home_visit_events').insert({
      home_visit_id: visitId,
      type: 'CANCELLED',
      performed_by_user_id: user.userId,
      details: cancelNote ? { reason: cancelNote } : {},
    });

    return (await this.enrichVisitsWithInitials([mapHomeVisit(updated)]))[0];
  }

  @Roles(UserRole.CARE_MANAGER)
  @Patch(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() body: AssignVisitDto,
    @CurrentUser() user: AuthUser,
  ) {
    const visitId = this.objectId(id, 'Atendimento inválido');
    const careGroupId = this.objectId(body.careGroupId, 'Grupo inválido');
    const managerId = this.objectId(user.userId, 'Gerente inválido');
    const assignedCaregiverId = this.objectId(body.assignedCaregiverId, 'Cuidador inválido');

    const { data: groupRow } = await this.supabase.client
      .from('care_groups')
      .select('*')
      .eq('id', careGroupId)
      .eq('manager_id', managerId)
      .contains('caregiver_ids', [assignedCaregiverId])
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!groupRow) throw new BadRequestException('Grupo ou cuidador inválido');

    const group = mapCareGroup(groupRow);
    if (!group.patientIds.length) {
      throw new BadRequestException('Atendimento não encontrado');
    }

    const { data: updated, error } = await this.supabase.client
      .from('home_visits')
      .update({
        care_group_id: careGroupId,
        assigned_caregiver_id: assignedCaregiverId,
        scheduled_window: body.scheduledWindow,
        manager_id: managerId,
        status: 'SCHEDULED',
      })
      .eq('id', visitId)
      .in('status', ['REQUESTED', 'TRIAGED'])
      .in('patient_id', group.patientIds)
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new BadRequestException('Atendimento não encontrado');
    }

    await this.supabase.client.from('home_visit_events').insert({
      home_visit_id: visitId,
      type: 'ASSIGNED',
      performed_by_user_id: managerId,
      details: {
        careGroupId,
        assignedCaregiverId,
        scheduledWindow: body.scheduledWindow,
      },
    });

    return (await this.enrichVisitsWithInitials([mapHomeVisit(updated)]))[0];
  }

  @Roles(UserRole.CAREGIVER)
  @Patch(':id/status')
  async status(
    @Param('id') id: string,
    @Body() body: StatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'].includes(body.status)) {
      throw new BadRequestException('Status inválido');
    }
    const visitId = this.objectId(id, 'Atendimento inválido');
    const assignedCaregiverId = this.objectId(user.userId, 'Cuidador inválido');

    const updatePayload: Record<string, unknown> = { status: body.status };
    if (body.caregiverNotes !== undefined) {
      updatePayload.caregiver_notes = body.caregiverNotes;
    }

    const { data: updated, error } = await this.supabase.client
      .from('home_visits')
      .update(updatePayload)
      .eq('id', visitId)
      .eq('assigned_caregiver_id', assignedCaregiverId)
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new BadRequestException('Atendimento não encontrado');
    }

    await this.supabase.client.from('home_visit_events').insert({
      home_visit_id: visitId,
      type: 'STATUS_CHANGED',
      performed_by_user_id: assignedCaregiverId,
      details: { ...body },
    });

    return (await this.enrichVisitsWithInitials([mapHomeVisit(updated)]))[0];
  }

  private async enrichVisitsWithInitials(visits: HomeVisit[]): Promise<HomeVisit[]> {
    if (!visits.length) return visits;
    const uniquePatientIds = [...new Set(visits.map((v) => v.patientId).filter(Boolean))];
    if (!uniquePatientIds.length) return visits;

    const { data: users } = await this.supabase.client
      .from('users')
      .select('id, name')
      .in('id', uniquePatientIds);

    const initialsById = new Map<string, string>();
    for (const u of users ?? []) {
      initialsById.set(String(u.id), formatNameInitials(u.name));
    }

    return visits.map((visit) => ({
      ...visit,
      patientInitials: initialsById.get(visit.patientId) ?? 'P.',
    }));
  }

  private async assertResponsiblePatientAccess(
    responsibleUserId: string,
    patientId: string,
  ): Promise<void> {
    const responsibleId = this.objectId(responsibleUserId, 'Responsável inválido');
    const { count, error } = await this.supabase.client
      .from('care_groups')
      .select('id', { count: 'exact', head: true })
      .contains('responsible_ids', [responsibleId])
      .contains('patient_ids', [patientId])
      .eq('status', 'ACTIVE');

    if (error || !count || count < 1) {
      throw new ForbiddenException('Sem acesso a este paciente');
    }
  }

  private objectId(value: string, message: string): string {
    if (!isValidUuid(value)) throw new BadRequestException(message);
    return value.trim();
  }

  private async assertResponsiblePatientAccess(responsibleUserId: string, patientId: Types.ObjectId): Promise<void> {
    const responsibleId = this.objectId(responsibleUserId, 'Responsável inválido');
    const allowed = await this.groups.exists({ responsibleIds: responsibleId, patientIds: patientId, ...activeGroupFilter });
    if (!allowed) throw new ForbiddenException('Sem acesso a este paciente');
  }

  private objectId(value: string, message: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(message);
    return new Types.ObjectId(value);
  }
}
