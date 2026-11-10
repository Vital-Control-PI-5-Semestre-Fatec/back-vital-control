import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../common/auth';
import {
  mapMedication,
  mapMedicationAdministration,
  mapMedicationSchedule,
} from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';
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
    private readonly supabase: SupabaseService,
    private readonly medicationService: MedicationsService,
  ) {}

  async list(patientId: string): Promise<unknown> {
    const { data, error } = await this.supabase.client
      .from('medication_schedules')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(mapMedicationSchedule);
  }

  async history(patientId: string, date?: string): Promise<unknown> {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await this.ensureOccurrencesForDate(patientId, date);
    }

    await this.markExpired();

    const { data, error } = await this.supabase.client
      .from('medication_administrations')
      .select('*')
      .eq('patient_id', patientId)
      .order('scheduled_for', { ascending: false });

    if (error || !data) {
      return [];
    }

    const mapped = data.map(mapMedicationAdministration);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return mapped.filter((item) => item.scheduledFor.slice(0, 10) === date);
    }

    return mapped;
  }

  private async ensureOccurrencesForDate(
    patientId: string,
    date: string,
  ): Promise<void> {
    const { data: scheduleRows } = await this.supabase.client
      .from('medication_schedules')
      .select('*')
      .eq('patient_id', patientId)
      .eq('active', true);

    if (!scheduleRows?.length) return;

    const selectedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return;

    for (const row of scheduleRows) {
      const schedule = mapMedicationSchedule(row);
      if (!this.scheduleAppliesToDate(schedule, selectedDate)) continue;

      for (const time of schedule.times) {
        const scheduledFor = new Date(`${date}T${time}:00`);
        if (!Number.isNaN(scheduledFor.getTime())) {
          await this.createOccurrence(patientId, schedule.id, scheduledFor).catch(
            () => undefined,
          );
        }
      }
    }
  }

  private scheduleAppliesToDate(
    schedule: ReturnType<typeof mapMedicationSchedule>,
    date: Date,
  ): boolean {
    const dateOnly = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const selectedDay = dateOnly(date);
    const firstDay = dateOnly(new Date(schedule.startDate));

    if (selectedDay < firstDay) return false;
    if (schedule.endDate) {
      const lastDay = dateOnly(new Date(schedule.endDate));
      if (selectedDay > lastDay) return false;
    }

    const recType = String(schedule.recurrence?.type ?? 'DAILY');
    if (recType === 'DAILY') return true;
    if (recType === 'WEEKDAYS') {
      const weekdays = Array.isArray(schedule.recurrence?.weekdays)
        ? (schedule.recurrence.weekdays as number[])
        : [];
      return weekdays.includes(selectedDay.getDay());
    }

    const intervalDays = Number(schedule.recurrence?.intervalDays ?? 1) || 1;
    const elapsedDays = Math.floor(
      (selectedDay.getTime() - firstDay.getTime()) / 86_400_000,
    );
    return elapsedDays % intervalDays === 0;
  }

  async create(
    patientId: string,
    input: CreateScheduleInput,
  ): Promise<unknown> {
    this.validateScheduleInput(input, false);

    const { data: medicationRow } = await this.supabase.client
      .from('medications')
      .select('id')
      .eq('id', input.medicationId)
      .eq('patient_id', patientId)
      .eq('active', true)
      .maybeSingle();

    if (!medicationRow) {
      throw new BadRequestException(
        'Medicamento ativo do paciente não encontrado',
      );
    }

    const { data: scheduleRow, error } = await this.supabase.client
      .from('medication_schedules')
      .insert({
        patient_id: patientId,
        medication_id: input.medicationId,
        title: input.title,
        dose: input.dose,
        times: input.times,
        recurrence: input.recurrence,
        start_date: new Date(input.startDate).toISOString(),
        end_date: input.endDate ? new Date(input.endDate).toISOString() : null,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        instructions: input.instructions ?? null,
        active: true,
      })
      .select()
      .single();

    if (error || !scheduleRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao criar rotina de medicação',
      );
    }

    return mapMedicationSchedule(scheduleRow);
  }

  async update(
    patientId: string,
    scheduleId: string,
    input: UpdateScheduleInput,
  ): Promise<unknown> {
    this.validateScheduleInput(input, true);

    const { data: existingRow } = await this.supabase.client
      .from('medication_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!existingRow) {
      throw new NotFoundException('Rotina não encontrada');
    }

    if (input.medicationId) {
      const { data: medicationRow } = await this.supabase.client
        .from('medications')
        .select('id')
        .eq('id', input.medicationId)
        .eq('patient_id', patientId)
        .eq('active', true)
        .maybeSingle();

      if (!medicationRow) {
        throw new BadRequestException(
          'Medicamento ativo do paciente não encontrado',
        );
      }
    }

    const schedule = mapMedicationSchedule(existingRow);
    const updatePayload: Record<string, unknown> = {
      timezone: input.timezone ?? schedule.timezone ?? 'America/Sao_Paulo',
    };

    if (input.medicationId !== undefined) updatePayload.medication_id = input.medicationId;
    if (input.title !== undefined) updatePayload.title = input.title;
    if (input.dose !== undefined) updatePayload.dose = input.dose;
    if (input.times !== undefined) updatePayload.times = input.times;
    if (input.recurrence !== undefined) updatePayload.recurrence = input.recurrence;
    if (input.startDate !== undefined) {
      updatePayload.start_date = new Date(input.startDate).toISOString();
    }
    if (input.endDate !== undefined) {
      updatePayload.end_date = input.endDate ? new Date(input.endDate).toISOString() : null;
    }
    if (input.instructions !== undefined) updatePayload.instructions = input.instructions;

    const { data: updatedRow, error } = await this.supabase.client
      .from('medication_schedules')
      .update(updatePayload)
      .eq('id', scheduleId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao atualizar rotina',
      );
    }

    return mapMedicationSchedule(updatedRow);
  }

  async deactivate(patientId: string, scheduleId: string): Promise<unknown> {
    const { data: existingRow } = await this.supabase.client
      .from('medication_schedules')
      .select('id')
      .eq('id', scheduleId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!existingRow) {
      throw new NotFoundException('Rotina não encontrada');
    }

    const { data: updatedRow, error } = await this.supabase.client
      .from('medication_schedules')
      .update({ active: false })
      .eq('id', scheduleId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao desativar rotina',
      );
    }

    return mapMedicationSchedule(updatedRow);
  }

  async createOccurrence(
    patientId: string,
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<unknown> {
    const { data: scheduleRow } = await this.supabase.client
      .from('medication_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('patient_id', patientId)
      .eq('active', true)
      .maybeSingle();

    if (!scheduleRow) {
      throw new NotFoundException('Rotina não encontrada');
    }

    const schedule = mapMedicationSchedule(scheduleRow);

    const { data: medicationRow } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('id', schedule.medicationId)
      .maybeSingle();

    if (!medicationRow) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const medication = mapMedication(medicationRow);
    const scheduledIso = scheduledFor.toISOString();

    const { data: existingAdmin } = await this.supabase.client
      .from('medication_administrations')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('scheduled_for', scheduledIso)
      .maybeSingle();

    if (existingAdmin) {
      return mapMedicationAdministration(existingAdmin);
    }

    const { data: createdAdmin, error } = await this.supabase.client
      .from('medication_administrations')
      .upsert(
        {
          patient_id: patientId,
          schedule_id: scheduleId,
          medication_id: schedule.medicationId,
          scheduled_for: scheduledIso,
          status: 'PENDING',
          medication_snapshot: {
            name: medication.name,
            dosageDescription: medication.dosageDescription,
            dose: schedule.dose,
          },
        },
        {
          onConflict: 'schedule_id,scheduled_for',
          ignoreDuplicates: true,
        },
      )
      .select()
      .maybeSingle();

    if (createdAdmin) {
      return mapMedicationAdministration(createdAdmin);
    }

    const { data: fallbackAdmin } = await this.supabase.client
      .from('medication_administrations')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('scheduled_for', scheduledIso)
      .maybeSingle();

    if (error || !fallbackAdmin) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao criar ocorrência',
      );
    }

    return mapMedicationAdministration(fallbackAdmin);
  }

  async updateStatus(
    patientId: string,
    administrationId: string,
    input: { status: string; justification?: string; notes?: string },
    user: AuthUser,
  ): Promise<unknown> {
    const { data: adminRow } = await this.supabase.client
      .from('medication_administrations')
      .select('*')
      .eq('id', administrationId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!adminRow) {
      throw new NotFoundException('Ocorrência não encontrada');
    }

    const administration = mapMedicationAdministration(adminRow);

    if (administration.status !== 'PENDING') {
      throw new BadRequestException('Ocorrência já finalizada');
    }

    const elapsed = Date.now() - new Date(administration.scheduledFor).getTime();

    if (elapsed > 86_400_000) {
      throw new BadRequestException('Prazo de 24 horas encerrado');
    }

    let nextStatus: string;
    if (input.status === 'SKIPPED') {
      nextStatus = 'SKIPPED';
    } else {
      const dose = administration.medicationSnapshot.dose as {
        quantity: number;
      };

      await this.medicationService.consumeForAdministration(
        patientId,
        String(administration.medicationId),
        String(administration.id),
        dose.quantity,
        user.userId,
      );

      nextStatus =
        input.status === 'TAKEN_LATE' ? 'TAKEN_LATE' : 'TAKEN_ON_TIME';
    }

    const { data: updatedRow, error } = await this.supabase.client
      .from('medication_administrations')
      .update({
        status: nextStatus,
        completed_at: new Date().toISOString(),
        justification: input.justification ?? input.notes ?? null,
        notes: input.notes ?? input.justification ?? null,
        performed_by_user_id: user.userId,
      })
      .eq('id', administrationId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao atualizar ocorrência',
      );
    }

    return mapMedicationAdministration(updatedRow);
  }

  async assertCaregiverHasActiveVisit(
    patientId: string,
    caregiverId: string,
  ): Promise<void> {
    const { count, error } = await this.supabase.client
      .from('home_visits')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('assigned_caregiver_id', caregiverId)
      .eq('status', 'IN_PROGRESS');

    if (error || !count || count < 1) {
      throw new BadRequestException(
        'Cuidador sem atendimento em andamento para este paciente',
      );
    }
  }

  async markExpired(): Promise<unknown> {
    const thresholdIso = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await this.supabase.client
      .from('medication_administrations')
      .update({ status: 'MISSED' })
      .eq('status', 'PENDING')
      .lt('scheduled_for', thresholdIso)
      .select('id');

    return data ?? [];
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
