import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { CareGroup, User } from '../database/schemas';

const activeUserFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };
const activeGroupFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };

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

@Controller('care-groups')
export class CareGroupsController {
  constructor(
    @InjectModel(CareGroup.name) private readonly groups: Model<CareGroup>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    const userId = new Types.ObjectId(user.userId);
    const groups = await this.groups.find({
      $and: [
        {
          $or: [
            { managerId: userId },
            { patientIds: userId },
            { caregiverIds: userId },
            { responsibleIds: userId },
          ],
        },
        activeGroupFilter,
      ],
    }).lean();
    return groups.map((group) => this.response(group));
  }

  @Roles(UserRole.CARE_MANAGER) @Post()
  async create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthUser) {
    const members = await this.validatedMembers(body);
    const group = await this.groups.create({
      name: body.name,
      managerId: this.objectId(user.userId, 'Gerente invalido'),
      ...members,
    });
    return this.response(group.toObject());
  }

  @Roles(UserRole.CARE_MANAGER) @Patch(':id/members')
  async updateMembers(@Param('id') id: string, @Body() body: UpdateMembersDto, @CurrentUser() user: AuthUser) {
    const groupId = this.objectId(id, 'Grupo invalido');
    const managerId = this.objectId(user.userId, 'Gerente invalido');
    const group = await this.groups.findOne({ _id: groupId, managerId, ...activeGroupFilter });
    if (!group) throw new ForbiddenException('Grupo nao encontrado para este gerente');

    const update = await this.validatedMembers(body);

    const updated = await this.groups.findOneAndUpdate({ _id: groupId, managerId, ...activeGroupFilter }, update, { new: true, runValidators: true }).lean();
    if (!updated) throw new ForbiddenException('Grupo nao encontrado para este gerente');
    return this.response(updated);
  }

  private objectId(value: string, message: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(message);
    return new Types.ObjectId(value);
  }

  private uniqueObjectIds(values: string[], message: string): Types.ObjectId[] {
    const unique = [...new Set(values)];
    return unique.map((value) => this.objectId(value, message));
  }

  private async validatedMembers(body: UpdateMembersDto): Promise<Partial<Pick<CareGroup, 'patientIds' | 'caregiverIds' | 'responsibleIds'>>> {
    const members: Partial<Pick<CareGroup, 'patientIds' | 'caregiverIds' | 'responsibleIds'>> = {};
    if (body.patientIds) {
      members.patientIds = this.uniqueObjectIds(body.patientIds, 'Paciente invalido');
      await this.assertUsersWithRole(members.patientIds, UserRole.PATIENT, 'Paciente inexistente ou com perfil invalido');
    }
    if (body.caregiverIds) {
      members.caregiverIds = this.uniqueObjectIds(body.caregiverIds, 'Cuidador invalido');
      await this.assertUsersWithRole(members.caregiverIds, UserRole.CAREGIVER, 'Cuidador inexistente ou com perfil invalido');
    }
    if (body.responsibleIds) {
      members.responsibleIds = this.uniqueObjectIds(body.responsibleIds, 'Responsavel invalido');
      await this.assertUsersWithRole(members.responsibleIds, UserRole.RESPONSIBLE, 'Responsavel inexistente ou com perfil invalido');
    }
    return members;
  }

  private async assertUsersWithRole(ids: Types.ObjectId[], role: UserRole, message: string): Promise<void> {
    const uniqueIds = [...new Set(ids.map(String))];
    const count = await this.users.countDocuments({ _id: { $in: uniqueIds }, role, ...activeUserFilter });
    if (count !== uniqueIds.length) throw new BadRequestException(message);
  }

  private response(group: CareGroup & { _id: unknown }) {
    return {
      ...group,
      id: String(group._id),
      patientIds: group.patientIds.map(String),
      managerId: String(group.managerId),
      caregiverIds: group.caregiverIds.map(String),
      responsibleIds: group.responsibleIds.map(String),
    };
  }
}