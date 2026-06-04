import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { CareGroup, HomeVisit, HomeVisitEvent } from '../database/schemas';

const activeGroupFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };

class RequestVisitDto {
  @IsString() reason: string;
  @IsOptional() @IsString() patientNotes?: string;
  @IsObject() requestedWindow: { start: string; end: string };
  @IsObject() addressSnapshot: Record<string, string>;
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

@Controller('home-visits')
export class HomeVisitsController {
  constructor(
    @InjectModel(HomeVisit.name) private readonly visits: Model<HomeVisit>,
    @InjectModel(HomeVisitEvent.name) private readonly events: Model<HomeVisitEvent>,
    @InjectModel(CareGroup.name) private readonly groups: Model<CareGroup>,
  ) {}

  @Roles(UserRole.PATIENT) @Post()
  async request(@Body() body: RequestVisitDto, @CurrentUser() user: AuthUser) {
    const patientId = this.objectId(user.userId, 'Paciente inválido');
    const visit = await this.visits.create({ ...body, patientId });
    await this.events.create({ homeVisitId: visit._id, type: 'CREATED', performedByUserId: user.userId });
    return visit;
  }

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CARE_MANAGER) {
      const managerId = this.objectId(user.userId, 'Gerente inválido');
      const groups = await this.groups.find({ managerId, ...activeGroupFilter }).select('patientIds').lean();
      const patientIds = groups.flatMap((group) => group.patientIds);
      const patientIdStrings = patientIds.map(String);
      return this.visits.find({
        $or: [
          { managerId },
          {
            status: 'REQUESTED',
            managerId: null,
            $expr: { $in: [{ $toString: '$patientId' }, patientIdStrings] },
          },
        ],
      }).sort({ createdAt: -1 });
    }

    const filter =
      user.role === UserRole.PATIENT
        ? { patientId: this.objectId(user.userId, 'Paciente inválido') }
        : user.role === UserRole.CAREGIVER
          ? { assignedCaregiverId: this.objectId(user.userId, 'Cuidador inválido') }
          : { _id: null };
    return this.visits.find(filter).sort({ createdAt: -1 });
  }

  @Roles(UserRole.PATIENT) @Put(':id')
  async edit(@Param('id') id: string, @Body() body: EditVisitDto, @CurrentUser() user: AuthUser) {
    const visit = await this.visits.findOne({ _id: id, patientId: user.userId });
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    if (visit.status !== 'REQUESTED') throw new BadRequestException('Apenas solicitações em triagem podem ser editadas');
    if (body.reason) visit.reason = body.reason;
    await visit.save();
    await this.events.create({ homeVisitId: id, type: 'EDITED', performedByUserId: user.userId, details: { ...body } });
    return visit;
  }

  @Roles(UserRole.PATIENT) @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const visit = await this.visits.findOne({ _id: id, patientId: user.userId });
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    if (!['REQUESTED', 'TRIAGED', 'SCHEDULED'].includes(visit.status)) {
      throw new BadRequestException('Atendimento já iniciado ou finalizado');
    }
    visit.status = 'CANCELLED';
    await visit.save();
    await this.events.create({ homeVisitId: id, type: 'CANCELLED', performedByUserId: user.userId });
    return visit;
  }

  @Roles(UserRole.CARE_MANAGER) @Patch(':id/assign')
  async assign(@Param('id') id: string, @Body() body: AssignVisitDto, @CurrentUser() user: AuthUser) {
    const visitId = this.objectId(id, 'Atendimento inválido');
    const careGroupId = this.objectId(body.careGroupId, 'Grupo inválido');
    const managerId = this.objectId(user.userId, 'Gerente inválido');
    const assignedCaregiverId = this.objectId(body.assignedCaregiverId, 'Cuidador inválido');

    const group = await this.groups.findOne({
      _id: careGroupId,
      managerId,
      caregiverIds: assignedCaregiverId,
      ...activeGroupFilter,
    });
    if (!group) throw new BadRequestException('Grupo ou cuidador inválido');

    const patientIdStrings = group.patientIds.map(String);
    const visit = await this.visits.findOneAndUpdate(
      {
        _id: visitId,
        status: { $in: ['REQUESTED', 'TRIAGED'] },
        $expr: { $in: [{ $toString: '$patientId' }, patientIdStrings] },
      },
      {
        careGroupId,
        assignedCaregiverId,
        scheduledWindow: body.scheduledWindow,
        managerId,
        status: 'SCHEDULED',
      },
      { new: true, runValidators: true },
    );
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    await this.events.create({
      homeVisitId: visitId,
      type: 'ASSIGNED',
      performedByUserId: managerId,
      details: { careGroupId, assignedCaregiverId, scheduledWindow: body.scheduledWindow },
    });
    return visit;
  }

  @Roles(UserRole.CAREGIVER) @Patch(':id/status')
  async status(@Param('id') id: string, @Body() body: StatusDto, @CurrentUser() user: AuthUser) {
    if (!['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'].includes(body.status)) throw new BadRequestException('Status inválido');
    const visitId = this.objectId(id, 'Atendimento inválido');
    const assignedCaregiverId = this.objectId(user.userId, 'Cuidador inválido');
    const visit = await this.visits.findOneAndUpdate({ _id: visitId, assignedCaregiverId }, body, { new: true });
    if (!visit) throw new BadRequestException('Atendimento não encontrado');
    await this.events.create({ homeVisitId: visitId, type: 'STATUS_CHANGED', performedByUserId: assignedCaregiverId, details: { ...body } });
    return visit;
  }

  private objectId(value: string, message: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(message);
    return new Types.ObjectId(value);
  }
}
