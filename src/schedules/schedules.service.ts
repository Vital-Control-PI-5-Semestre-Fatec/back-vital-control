import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../common/auth';
import { HomeVisit, Medication, MedicationAdministration, MedicationSchedule } from '../database/schemas';
import { MedicationsService } from '../medications/medications.service';

export interface CreateScheduleInput {
  medicationId: string;
  title: string;
  dose: { quantity: number; unit: string };
  times: string[];
  recurrence: Record<string, unknown>;
  startDate: string;
  endDate?: string;
  timezone?: string;
  instructions?: string;
}

@Injectable()
export class SchedulesService {
  constructor(
    @InjectModel(MedicationSchedule.name) private readonly schedules: Model<MedicationSchedule>,
    @InjectModel(MedicationAdministration.name) private readonly administrations: Model<MedicationAdministration>,
    @InjectModel(Medication.name) private readonly medications: Model<Medication>,
    @InjectModel(HomeVisit.name) private readonly visits: Model<HomeVisit>,
    private readonly medicationService: MedicationsService,
  ) {}

  list(patientId: string) { return this.schedules.find({ patientId }).sort({ createdAt: -1 }); }
  async history(patientId: string) {
    await this.markExpired();
    return this.administrations.find({ patientId }).sort({ scheduledFor: -1 });
  }

  async create(patientId: string, input: CreateScheduleInput) {
    const medication = await this.medications.findOne({ _id: input.medicationId, patientId, active: true });
    if (!medication) throw new BadRequestException('Medicamento ativo do paciente não encontrado');
    return this.schedules.create({ ...input, patientId });
  }

  async createOccurrence(patientId: string, scheduleId: string, scheduledFor: Date) {
    const schedule = await this.schedules.findOne({ _id: scheduleId, patientId, active: true });
    if (!schedule) throw new NotFoundException('Rotina não encontrada');
    const medication = await this.medications.findById(schedule.medicationId);
    if (!medication) throw new NotFoundException('Medicamento não encontrado');
    return this.administrations.findOneAndUpdate(
      { scheduleId, scheduledFor },
      { $setOnInsert: { patientId, scheduleId, medicationId: schedule.medicationId, scheduledFor, status: 'PENDING', medicationSnapshot: { name: medication.name, dosageDescription: medication.dosageDescription, dose: schedule.dose } } },
      { upsert: true, new: true },
    );
  }

  async complete(patientId: string, administrationId: string, input: { notes?: string }, user: AuthUser) {
    const administration = await this.administrations.findOne({ _id: administrationId, patientId });
    if (!administration) throw new NotFoundException('Ocorrência não encontrada');
    if (administration.status !== 'PENDING') throw new BadRequestException('Ocorrência já finalizada');
    const elapsed = Date.now() - administration.scheduledFor.getTime();
    if (elapsed > 86400000) throw new BadRequestException('Prazo de 24 horas encerrado');
    const dose = administration.medicationSnapshot.dose as { quantity: number };
    await this.medicationService.consumeForAdministration(patientId, String(administration.medicationId), String(administration._id), dose.quantity, user.userId);
    administration.status = elapsed > 0 ? 'TAKEN_LATE' : 'TAKEN_ON_TIME';
    administration.completedAt = new Date();
    administration.performedByUserId = user.userId as never;
    administration.notes = input.notes;
    return administration.save();
  }

  async assertCaregiverHasActiveVisit(patientId: string, caregiverId: string) {
    const visit = await this.visits.exists({ patientId, assignedCaregiverId: caregiverId, status: 'IN_PROGRESS' });
    if (!visit) throw new BadRequestException('Cuidador sem atendimento em andamento para este paciente');
  }

  async markExpired() {
    return this.administrations.updateMany({ status: 'PENDING', scheduledFor: { $lt: new Date(Date.now() - 86400000) } }, { status: 'MISSED' });
  }
}
