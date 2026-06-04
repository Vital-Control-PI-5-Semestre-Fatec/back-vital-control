import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../common/auth';
import {
  HomeVisit,
  Medication,
  MedicationAdministration,
  MedicationSchedule,
} from '../database/schemas';
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

export type UpdateScheduleInput = Partial<CreateScheduleInput>;

@Injectable()
export class SchedulesService {
  constructor(
    @InjectModel(MedicationSchedule.name)
    private readonly schedules: Model<MedicationSchedule>,

    @InjectModel(MedicationAdministration.name)
    private readonly administrations: Model<MedicationAdministration>,

    @InjectModel(Medication.name)
    private readonly medications: Model<Medication>,

    @InjectModel(HomeVisit.name)
    private readonly visits: Model<HomeVisit>,

    private readonly medicationService: MedicationsService,
  ) {}

  async list(patientId: string): Promise<unknown> {
    const schedules = await this.schedules
      .find({ patientId })
      .sort({ createdAt: -1 })
      .exec();

    return schedules;
  }

  async history(patientId: string): Promise<unknown> {
    await this.markExpired();

    const administrations = await this.administrations
      .find({ patientId })
      .sort({ scheduledFor: -1 })
      .exec();

    return administrations;
  }

  async create(
    patientId: string,
    input: CreateScheduleInput,
  ): Promise<unknown> {
    this.validateScheduleInput(input, false);

    const medication = await this.medications
      .findOne({
        _id: input.medicationId,
        patientId,
        active: true,
      })
      .exec();

    if (!medication) {
      throw new BadRequestException(
        'Medicamento ativo do paciente não encontrado',
      );
    }

    const schedule = await this.schedules.create({
      ...input,
      patientId,
      active: true,
      timezone: input.timezone ?? 'America/Sao_Paulo',
    });

    return schedule;
  }

  async update(
    patientId: string,
    scheduleId: string,
    input: UpdateScheduleInput,
  ): Promise<unknown> {
    this.validateScheduleInput(input, true);

    const schedule = await this.schedules
      .findOne({
        _id: scheduleId,
        patientId,
      })
      .exec();

    if (!schedule) {
      throw new NotFoundException('Rotina não encontrada');
    }

    if (input.medicationId) {
      const medication = await this.medications
        .findOne({
          _id: input.medicationId,
          patientId,
          active: true,
        })
        .exec();

      if (!medication) {
        throw new BadRequestException(
          'Medicamento ativo do paciente não encontrado',
        );
      }
    }

    schedule.set({
      ...input,
      timezone: input.timezone ?? schedule.timezone ?? 'America/Sao_Paulo',
    });

    const savedSchedule = await schedule.save();

    return savedSchedule;
  }

  async deactivate(patientId: string, scheduleId: string): Promise<unknown> {
    const schedule = await this.schedules
      .findOne({
        _id: scheduleId,
        patientId,
      })
      .exec();

    if (!schedule) {
      throw new NotFoundException('Rotina não encontrada');
    }

    schedule.set({ active: false });

    const savedSchedule = await schedule.save();

    return savedSchedule;
  }

  async createOccurrence(
    patientId: string,
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<unknown> {
    const schedule = await this.schedules
      .findOne({
        _id: scheduleId,
        patientId,
        active: true,
      })
      .exec();

    if (!schedule) {
      throw new NotFoundException('Rotina não encontrada');
    }

    const medication = await this.medications
      .findById(schedule.medicationId)
      .exec();

    if (!medication) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const administration = await this.administrations
      .findOneAndUpdate(
        { scheduleId, scheduledFor },
        {
          $setOnInsert: {
            patientId,
            scheduleId,
            medicationId: schedule.medicationId,
            scheduledFor,
            status: 'PENDING',
            medicationSnapshot: {
              name: medication.name,
              dosageDescription: medication.dosageDescription,
              dose: schedule.dose,
            },
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return administration;
  }

  async updateStatus(
    patientId: string,
    administrationId: string,
    input: { status: string; justification?: string },
    user: AuthUser,
  ): Promise<unknown> {
    const administration = await this.administrations
      .findOne({
        _id: administrationId,
        patientId,
      })
      .exec();

    if (!administration) {
      throw new NotFoundException('Ocorrência não encontrada');
    }

    if (administration.status !== 'PENDING') {
      throw new BadRequestException('Ocorrência já finalizada');
    }

    const elapsed = Date.now() - administration.scheduledFor.getTime();

    if (elapsed > 86_400_000) {
      throw new BadRequestException('Prazo de 24 horas encerrado');
    }

    if (input.status === 'SKIPPED') {
      administration.status = 'SKIPPED';
    } else {
      const dose = administration.medicationSnapshot.dose as {
        quantity: number;
      };

      await this.medicationService.consumeForAdministration(
        patientId,
        String(administration.medicationId),
        String(administration._id),
        dose.quantity,
        user.userId,
      );

      administration.status =
        input.status === 'TAKEN_LATE' ? 'TAKEN_LATE' : 'TAKEN_ON_TIME';
    }

    administration.completedAt = new Date();
    administration.justification = input.justification;

    administration.set({
      performedByUserId: user.userId,
    });

    const savedAdministration = await administration.save();

    return savedAdministration;
  }

  async assertCaregiverHasActiveVisit(
    patientId: string,
    caregiverId: string,
  ): Promise<void> {
    const visit = await this.visits
      .exists({
        patientId,
        assignedCaregiverId: caregiverId,
        status: 'IN_PROGRESS',
      })
      .exec();

    if (!visit) {
      throw new BadRequestException(
        'Cuidador sem atendimento em andamento para este paciente',
      );
    }
  }

  async markExpired(): Promise<unknown> {
    const result = await this.administrations
      .updateMany(
        {
          status: 'PENDING',
          scheduledFor: { $lt: new Date(Date.now() - 86_400_000) },
        },
        { status: 'MISSED' },
      )
      .exec();

    return result;
  }

  private validateScheduleInput(
    input: UpdateScheduleInput,
    partial: boolean,
  ): void {
    if (!partial || input.medicationId !== undefined) {
      if (!input.medicationId?.trim()) {
        throw new BadRequestException('Medicamento é obrigatório');
      }
    }

    if (!partial || input.title !== undefined) {
      if (!input.title?.trim()) {
        throw new BadRequestException('Título da rotina é obrigatório');
      }
    }

    if (!partial || input.dose !== undefined) {
      if (
        !input.dose ||
        Number(input.dose.quantity) <= 0 ||
        !input.dose.unit?.trim()
      ) {
        throw new BadRequestException('Dose inválida');
      }
    }

    if (!partial || input.times !== undefined) {
      if (!input.times?.length) {
        throw new BadRequestException('Informe ao menos um horário');
      }

      const invalidTime = input.times.some(
        (time) => !/^\d{2}:\d{2}$/.test(time),
      );

      if (invalidTime) {
        throw new BadRequestException('Horários devem estar no formato HH:mm');
      }

      const uniqueTimes = new Set(input.times);

      if (uniqueTimes.size !== input.times.length) {
        throw new BadRequestException('Existem horários repetidos na rotina');
      }
    }

    if (!partial || input.recurrence !== undefined) {
      this.validateRecurrence(input.recurrence);
    }

    if (!partial || input.startDate !== undefined) {
      if (
        !input.startDate ||
        Number.isNaN(new Date(input.startDate).getTime())
      ) {
        throw new BadRequestException('Data inicial inválida');
      }
    }

    if (input.endDate) {
      const startDate = input.startDate ? new Date(input.startDate) : undefined;
      const endDate = new Date(input.endDate);

      if (Number.isNaN(endDate.getTime())) {
        throw new BadRequestException('Data final inválida');
      }

      if (startDate && endDate < startDate) {
        throw new BadRequestException(
          'Data final não pode ser menor que a data inicial',
        );
      }
    }
  }

  private validateRecurrence(recurrence?: Record<string, unknown>): void {
    if (!recurrence || typeof recurrence !== 'object') {
      throw new BadRequestException('Recorrência inválida');
    }

    const type = recurrence.type;

    if (!['DAILY', 'WEEKDAYS', 'INTERVAL_DAYS'].includes(String(type))) {
      throw new BadRequestException('Tipo de recorrência inválido');
    }

    if (type === 'WEEKDAYS') {
      const weekdays = recurrence.weekdays;

      if (!Array.isArray(weekdays) || weekdays.length === 0) {
        throw new BadRequestException('Selecione ao menos um dia da semana');
      }

      const invalidWeekday = weekdays.some(
        (weekday) => typeof weekday !== 'number' || weekday < 0 || weekday > 6,
      );

      if (invalidWeekday) {
        throw new BadRequestException('Dias da semana inválidos');
      }
    }

    if (type === 'INTERVAL_DAYS') {
      const intervalDays = recurrence.intervalDays;

      if (typeof intervalDays !== 'number' || intervalDays < 1) {
        throw new BadRequestException('Intervalo de dias inválido');
      }
    }
  }
}
