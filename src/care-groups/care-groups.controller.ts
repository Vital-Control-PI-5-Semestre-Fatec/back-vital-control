import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { CareGroup, formatNameInitials, mapCareGroup } from '../database/schemas';
import { isValidUuid, SupabaseService } from '../database/supabase.service';

class CreateGroupDto {
  @IsString() name: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) patientIds: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) caregiverIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) responsibleIds?: string[];
}

class UpdateMembersDto {
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsString({ each: true }) patientIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) caregiverIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) responsibleIds?: string[];
}

class UpdateStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE']) status: 'ACTIVE' | 'INACTIVE';
}

@Controller('care-groups')
export class CareGroupsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    const userId = this.objectId(user.userId, 'Usuário inválido');

    const filter =
      user.role === UserRole.CARE_MANAGER
        ? `manager_id.eq.${userId},and(status.eq.ACTIVE,or(patient_ids.cs.{${userId}},caregiver_ids.cs.{${userId}},responsible_ids.cs.{${userId}}))`
        : `and(status.eq.ACTIVE,or(manager_id.eq.${userId},patient_ids.cs.{${userId}},caregiver_ids.cs.{${userId}},responsible_ids.cs.{${userId}}))`;

    const { data, error } = await this.supabase.client
      .from('care_groups')
      .select('*')
      .or(filter);

    if (error || !data) {
      return [];
    }

    return this.enrichGroupsWithInitials(data.map((row) => this.response(mapCareGroup(row))));
  }

  @Roles(UserRole.CARE_MANAGER)
  @Post()
  async create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthUser) {
    const managerId = this.objectId(user.userId, 'Gerente invalido');
    const members = await this.validatedMembers(body);

    const { data, error } = await this.supabase.client
      .from('care_groups')
      .insert({
        name: body.name,
        manager_id: managerId,
        patient_ids: members.patientIds ?? [],
        caregiver_ids: members.caregiverIds ?? [],
        responsible_ids: members.responsibleIds ?? [],
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Erro ao criar grupo');
    }

    return (await this.enrichGroupsWithInitials([this.response(mapCareGroup(data))]))[0];
  }

  @Roles(UserRole.CARE_MANAGER)
  @Patch(':id/members')
  async updateMembers(
    @Param('id') id: string,
    @Body() body: UpdateMembersDto,
    @CurrentUser() user: AuthUser,
  ) {
    const groupId = this.objectId(id, 'Grupo invalido');
    const managerId = this.objectId(user.userId, 'Gerente invalido');

    const { data: existing } = await this.supabase.client
      .from('care_groups')
      .select('id')
      .eq('id', groupId)
      .eq('manager_id', managerId)
      .maybeSingle();

    if (!existing) {
      throw new ForbiddenException('Grupo nao encontrado para este gerente');
    }

    const members = await this.validatedMembers(body);
    const updatePayload: Record<string, unknown> = {};
    if (members.patientIds !== undefined) updatePayload.patient_ids = members.patientIds;
    if (members.caregiverIds !== undefined) updatePayload.caregiver_ids = members.caregiverIds;
    if (members.responsibleIds !== undefined) updatePayload.responsible_ids = members.responsibleIds;

    const { data: updated, error } = await this.supabase.client
      .from('care_groups')
      .update(updatePayload)
      .eq('id', groupId)
      .eq('manager_id', managerId)
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new ForbiddenException('Grupo nao encontrado para este gerente');
    }

    return (await this.enrichGroupsWithInitials([this.response(mapCareGroup(updated))]))[0];
  }

  @Roles(UserRole.CARE_MANAGER)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    const groupId = this.objectId(id, 'Grupo invalido');
    const managerId = this.objectId(user.userId, 'Gerente invalido');

    const { data: updated, error } = await this.supabase.client
      .from('care_groups')
      .update({ status: body.status })
      .eq('id', groupId)
      .eq('manager_id', managerId)
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new ForbiddenException('Grupo nao encontrado para este gerente');
    }

    return (await this.enrichGroupsWithInitials([this.response(mapCareGroup(updated))]))[0];
  }

  @Roles(UserRole.CARE_MANAGER)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const groupId = this.objectId(id, 'Grupo invalido');
    const managerId = this.objectId(user.userId, 'Gerente invalido');

    const { data: existing } = await this.supabase.client
      .from('care_groups')
      .select('id')
      .eq('id', groupId)
      .eq('manager_id', managerId)
      .maybeSingle();

    if (!existing) {
      throw new ForbiddenException('Grupo nao encontrado para este gerente');
    }

    await this.supabase.client
      .from('home_visits')
      .update({ care_group_id: null })
      .eq('care_group_id', groupId);

    const { error } = await this.supabase.client
      .from('care_groups')
      .delete()
      .eq('id', groupId)
      .eq('manager_id', managerId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { deleted: true, id: groupId };
  }

  private objectId(value: string, message: string): string {
    if (!isValidUuid(value)) throw new BadRequestException(message);
    return value.trim();
  }

  private uniqueObjectIds(values: string[], message: string): string[] {
    const unique = [...new Set(values)];
    return unique.map((value) => this.objectId(value, message));
  }

  private async validatedMembers(
    body: UpdateMembersDto,
  ): Promise<Partial<Pick<CareGroup, 'patientIds' | 'caregiverIds' | 'responsibleIds'>>> {
    const members: Partial<Pick<CareGroup, 'patientIds' | 'caregiverIds' | 'responsibleIds'>> = {};
    if (body.patientIds) {
      members.patientIds = this.uniqueObjectIds(body.patientIds, 'Paciente invalido');
      await this.assertUsersWithRole(
        members.patientIds,
        UserRole.PATIENT,
        'Paciente inexistente ou com perfil invalido',
      );
    }
    if (body.caregiverIds) {
      members.caregiverIds = this.uniqueObjectIds(body.caregiverIds, 'Cuidador invalido');
      await this.assertUsersWithRole(
        members.caregiverIds,
        UserRole.CAREGIVER,
        'Cuidador inexistente ou com perfil invalido',
      );
    }
    if (body.responsibleIds) {
      members.responsibleIds = this.uniqueObjectIds(body.responsibleIds, 'Responsavel invalido');
      await this.assertUsersWithRole(
        members.responsibleIds,
        UserRole.RESPONSIBLE,
        'Responsavel inexistente ou com perfil invalido',
      );
    }
    return members;
  }

  private async assertUsersWithRole(ids: string[], role: UserRole, message: string): Promise<void> {
    const uniqueIds = [...new Set(ids.map(String))];
    if (uniqueIds.length === 0) return;

    const { count, error } = await this.supabase.client
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('id', uniqueIds)
      .eq('role', role)
      .eq('status', 'ACTIVE');

    if (error || count !== uniqueIds.length) {
      throw new BadRequestException(message);
    }
  }

  private response(group: CareGroup) {
    return {
      ...group,
      id: String(group.id),
      _id: String(group._id),
      patientIds: group.patientIds.map(String),
      managerId: String(group.managerId),
      caregiverIds: group.caregiverIds.map(String),
      responsibleIds: group.responsibleIds.map(String),
    };
  }

  private async enrichGroupsWithInitials(groups: CareGroup[]): Promise<CareGroup[]> {
    if (!groups.length) return groups;
    const allPatientIds = [...new Set(groups.flatMap((g) => g.patientIds).filter(Boolean))];
    if (!allPatientIds.length) return groups;

    const { data: users } = await this.supabase.client
      .from('users')
      .select('id, name')
      .in('id', allPatientIds);

    const initialsById: Record<string, string> = {};
    for (const u of users ?? []) {
      initialsById[String(u.id)] = formatNameInitials(u.name);
    }

    return groups.map((group) => {
      const patientInitialsMap: Record<string, string> = {};
      for (const pid of group.patientIds) {
        patientInitialsMap[pid] = initialsById[pid] ?? 'P.';
      }
      return {
        ...group,
        patientInitialsMap,
      };
    });
  }
}
