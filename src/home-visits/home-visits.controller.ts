import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';
import { Model } from 'mongoose';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { CareGroup, HomeVisit, HomeVisitEvent } from '../database/schemas';

class RequestVisitDto {
  @IsString() reason: string;
  @IsOptional() @IsString() patientNotes?: string;
  @IsObject() requestedWindow: { start: string; end: string };
  @IsObject() addressSnapshot: Record<string, string>;
}
class AssignVisitDto {
  @IsString() careGroupId: string;
  @IsString() assignedCaregiverId: string;
  @IsObject() scheduledWindow: { start: string; end: string };
}
class StatusDto { @IsString() status: string; @IsOptional() @IsString() caregiverNotes?: string; }

@Controller('home-visits')
export class HomeVisitsController {
  constructor(
    @InjectModel(HomeVisit.name) private readonly visits: Model<HomeVisit>,
    @InjectModel(HomeVisitEvent.name) private readonly events: Model<HomeVisitEvent>,
    @InjectModel(CareGroup.name) private readonly groups: Model<CareGroup>,
  ) {}

  @Roles(UserRole.PATIENT) @Post()
  async request(@Body() body: RequestVisitDto, @CurrentUser() user: AuthUser) {
    const visit = await this.visits.create({ ...body, patientId: user.userId });
    await this.events.create({ homeVisitId: visit._id, type: 'CREATED', performedByUserId: user.userId });
    return visit;
  }
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    const filter = user.role === UserRole.PATIENT ? { patientId: user.userId } : user.role === UserRole.CAREGIVER ? { assignedCaregiverId: user.userId } : user.role === UserRole.CARE_MANAGER ? { managerId: user.userId } : { _id: null };
    return this.visits.find(filter).sort({ createdAt: -1 });
  }
  @Roles(UserRole.CARE_MANAGER) @Patch(':id/assign')
  async assign(@Param('id') id: string, @Body() body: AssignVisitDto, @CurrentUser() user: AuthUser) {
    const group = await this.groups.findOne({ _id: body.careGroupId, managerId: user.userId, caregiverIds: body.assignedCaregiverId, status: 'ACTIVE' });
    if (!group) throw new BadRequestException('Grupo ou cuidador inválido');
    const visit = await this.visits.findOneAndUpdate({ _id: id, patientId: group.patientId }, { ...body, managerId: user.userId, status: 'SCHEDULED' }, { new: true });
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    await this.events.create({ homeVisitId: id, type: 'ASSIGNED', performedByUserId: user.userId, details: { ...body } });
    return visit;
  }
  @Roles(UserRole.CAREGIVER) @Patch(':id/status')
  async status(@Param('id') id: string, @Body() body: StatusDto, @CurrentUser() user: AuthUser) {
    if (!['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'].includes(body.status)) throw new BadRequestException('Status inválido');
    const visit = await this.visits.findOneAndUpdate({ _id: id, assignedCaregiverId: user.userId }, body, { new: true });
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    await this.events.create({ homeVisitId: id, type: 'STATUS_CHANGED', performedByUserId: user.userId, details: { ...body } });
    return visit;
  }
}
