import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { Model } from 'mongoose';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { CareGroup } from '../database/schemas';

class CreateGroupDto { @IsString() name: string; @IsString() patientId: string; }
class UpdateMembersDto {
  @IsOptional() @IsArray() @IsString({ each: true }) caregiverIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) responsibleIds?: string[];
}

@Controller('care-groups')
export class CareGroupsController {
  constructor(@InjectModel(CareGroup.name) private readonly groups: Model<CareGroup>, private readonly access: AccessService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    const filter = user.role === UserRole.CARE_MANAGER ? { managerId: user.userId } : user.role === UserRole.CAREGIVER ? { caregiverIds: user.userId } : user.role === UserRole.RESPONSIBLE ? { responsibleIds: user.userId } : { patientId: user.userId };
    return this.groups.find({ ...filter, status: 'ACTIVE' });
  }
  @Roles(UserRole.CARE_MANAGER) @Post()
  create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthUser) { return this.groups.create({ ...body, managerId: user.userId }); }
  @Roles(UserRole.CARE_MANAGER) @Patch(':id/members')
  updateMembers(@Param('id') id: string, @Body() body: UpdateMembersDto, @CurrentUser() user: AuthUser) { return this.groups.findOneAndUpdate({ _id: id, managerId: user.userId, status: 'ACTIVE' }, body, { new: true }); }
}
