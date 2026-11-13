import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../common/auth';
import { mapMedication, mapStockMovement } from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';
import { AuditService } from '../audit/audit.service';

export interface CreateMedicationInput {
  name: string;
  dosageDescription: string;
  unit: string;
  currentQuantity?: number;
  lowStockThreshold?: number;
  barcode?: string;
  brand?: string;
  notes?: string;
  imageUrl?: string;
  registrationSource?: string;
}

export interface UpdateMedicationInput {
  name?: string;
  dosageDescription?: string;
  unit?: string;
  lowStockThreshold?: number;
  barcode?: string;
  brand?: string;
  notes?: string;
  imageUrl?: string;
  registrationSource?: string;
}

@Injectable()
export class MedicationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async list(patientId: string): Promise<unknown> {
    const { data, error } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(mapMedication);
  }

  async movementsFor(
    patientId: string,
    medicationId: string,
  ): Promise<unknown> {
    const { data, error } = await this.supabase.client
      .from('stock_movements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('medication_id', medicationId)
      .order('occurred_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(mapStockMovement);
  }

  async create(
    patientId: string,
    input: CreateMedicationInput,
    user: AuthUser,
  ): Promise<unknown> {
    const quantity = Number(input.currentQuantity ?? 0);
    const lowStockThreshold = Number(input.lowStockThreshold ?? 0);

    if (!input.name?.trim()) {
      throw new BadRequestException('Nome do medicamento é obrigatório');
    }

    if (!input.dosageDescription?.trim()) {
      throw new BadRequestException('Descrição da dose é obrigatória');
    }

    if (!input.unit?.trim()) {
      throw new BadRequestException('Unidade de estoque é obrigatória');
    }

    if (quantity < 0) {
      throw new BadRequestException('Saldo inicial inválido');
    }

    if (lowStockThreshold < 0) {
      throw new BadRequestException('Limite de estoque inválido');
    }

    const { data: medicationRow, error } = await this.supabase.client
      .from('medications')
      .insert({
        patient_id: patientId,
        name: input.name.trim(),
        dosage_description: input.dosageDescription.trim(),
        barcode: input.barcode ?? null,
        brand: input.brand ?? null,
        image_url: input.imageUrl ?? null,
        notes: input.notes ?? null,
        registration_source: input.registrationSource ?? 'MANUAL',
        active: true,
        stock: {
          currentQuantity: quantity,
          unit: input.unit,
          lowStockThreshold,
        },
      })
      .select()
      .single();

    if (error || !medicationRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao cadastrar medicamento',
      );
    }

    const medication = mapMedication(medicationRow);

    if (quantity > 0) {
      await this.supabase.client.from('stock_movements').insert({
        patient_id: patientId,
        medication_id: medication.id,
        type: 'INITIAL_BALANCE',
        direction: 'IN',
        quantity,
        stock_before: 0,
        stock_after: quantity,
        reason: 'Saldo inicial do cadastro',
        performed_by_user_id: user.userId,
      });
    }

    // Trilha de auditoria (RF08)
    void this.audit.record({
      actorUserId: user.userId,
      action: 'MEDICATION_CREATED',
      resourceType: 'MEDICATION',
      resourceId: medication.id,
      patientId,
      metadata: { name: medication.name, initialQuantity: quantity },
    });

    return medication;
  }

  async update(
    patientId: string,
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<unknown> {
    const { data: existingRow } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!existingRow) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const medication = mapMedication(existingRow);
    const updatePayload: Record<string, unknown> = {};

    if (input.name !== undefined) updatePayload.name = input.name.trim();
    if (input.dosageDescription !== undefined) {
      updatePayload.dosage_description = input.dosageDescription.trim();
    }
    if (input.barcode !== undefined) updatePayload.barcode = input.barcode;
    if (input.brand !== undefined) updatePayload.brand = input.brand;
    if (input.notes !== undefined) updatePayload.notes = input.notes;
    if (input.imageUrl !== undefined) updatePayload.image_url = input.imageUrl;
    if (input.registrationSource !== undefined) {
      updatePayload.registration_source = input.registrationSource;
    }

    const nextStock = { ...medication.stock };
    let stockChanged = false;

    if (input.unit !== undefined) {
      nextStock.unit = input.unit;
      stockChanged = true;
    }

    if (input.lowStockThreshold !== undefined) {
      if (input.lowStockThreshold < 0) {
        throw new BadRequestException('Limite de estoque inválido');
      }

      nextStock.lowStockThreshold = input.lowStockThreshold;
      stockChanged = true;
    }

    if (stockChanged) {
      updatePayload.stock = nextStock;
    }

    const { data: updatedRow, error } = await this.supabase.client
      .from('medications')
      .update(updatePayload)
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao atualizar medicamento',
      );
    }

    void this.audit.record({
      actorUserId: patientId,
      action: 'MEDICATION_UPDATED',
      resourceType: 'MEDICATION',
      resourceId: medicationId,
      patientId,
      metadata: { updatedFields: Object.keys(updatePayload) },
    });

    return mapMedication(updatedRow);
  }

  async deactivate(patientId: string, medicationId: string): Promise<unknown> {
    const { data: existingRow } = await this.supabase.client
      .from('medications')
      .select('id')
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!existingRow) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const { data: updatedRow, error } = await this.supabase.client
      .from('medications')
      .update({ active: false })
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao desativar medicamento',
      );
    }

    void this.audit.record({
      actorUserId: patientId,
      action: 'MEDICATION_DEACTIVATED',
      resourceType: 'MEDICATION',
      resourceId: medicationId,
      patientId,
    });

    return mapMedication(updatedRow);
  }

  async adjust(
    patientId: string,
    medicationId: string,
    input: { type: string; quantity: number; reason?: string },
    user: AuthUser,
  ): Promise<unknown> {
    const incoming = ['PURCHASE', 'MANUAL_ADJUSTMENT_IN'].includes(input.type);
    const outgoing = ['MANUAL_ADJUSTMENT_OUT', 'DISCARD'].includes(input.type);

    if (!incoming && !outgoing) {
      throw new BadRequestException('Tipo de movimentação inválido');
    }

    if (input.quantity <= 0) {
      throw new BadRequestException('Quantidade deve ser positiva');
    }

    const { data: existingRow } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .eq('active', true)
      .maybeSingle();

    if (!existingRow) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const medication = mapMedication(existingRow);
    const before = medication.stock.currentQuantity;
    const after = before + (incoming ? input.quantity : -input.quantity);

    if (after < 0) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const nextStock = {
      ...medication.stock,
      currentQuantity: after,
    };

    const { data: updatedRow, error } = await this.supabase.client
      .from('medications')
      .update({ stock: nextStock })
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .select()
      .single();

    if (error || !updatedRow) {
      throw new BadRequestException(
        error?.message ?? 'Erro ao atualizar estoque',
      );
    }

    await this.supabase.client.from('stock_movements').insert({
      patient_id: patientId,
      medication_id: medicationId,
      type: input.type,
      direction: incoming ? 'IN' : 'OUT',
      quantity: input.quantity,
      stock_before: before,
      stock_after: after,
      reason: input.reason ?? null,
      performed_by_user_id: user.userId,
    });

    return mapMedication(updatedRow);
  }

  async consumeForAdministration(
    patientId: string,
    medicationId: string,
    administrationId: string,
    quantity: number,
    userId: string,
  ): Promise<void> {
    const { data: existingMovement } = await this.supabase.client
      .from('stock_movements')
      .select('id')
      .eq('administration_id', administrationId)
      .maybeSingle();

    if (existingMovement) {
      return;
    }

    const { data: medicationRow } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('id', medicationId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (!medicationRow) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const medication = mapMedication(medicationRow);
    const before = medication.stock.currentQuantity;

    if (before < quantity) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const after = before - quantity;
    const nextStock = {
      ...medication.stock,
      currentQuantity: after,
    };

    const { error: updateError } = await this.supabase.client
      .from('medications')
      .update({ stock: nextStock })
      .eq('id', medicationId)
      .eq('patient_id', patientId);

    if (updateError) {
      throw new BadRequestException('Estoque insuficiente');
    }

    await this.supabase.client.from('stock_movements').insert({
      patient_id: patientId,
      medication_id: medicationId,
      administration_id: administrationId,
      type: 'ADMINISTRATION',
      direction: 'OUT',
      quantity,
      stock_before: before,
      stock_after: after,
      performed_by_user_id: userId,
    });
  }

  async searchCosmos(barcode: string): Promise<Record<string, unknown>> {
    const cleanBarcode = barcode.replace(/\D/g, '');
    const baseUrl = this.configService.get<string>('COSMOS_API_URL');
    const token = this.configService.get<string>('COSMOS_API_TOKEN');

    if (!cleanBarcode) {
      throw new BadRequestException('Código de barras inválido.');
    }

    if (!baseUrl || !token) {
      throw new BadRequestException(
        'Credenciais do Cosmos não configuradas no servidor.',
      );
    }

    const response = await fetch(`${baseUrl}/${cleanBarcode}.json`, {
      headers: { 'X-Cosmos-Token': token },
    });

    if (response.status === 404) {
      throw new NotFoundException(
        'Medicamento não encontrado na base do Cosmos.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        'Não foi possível comunicar com a API do Cosmos no momento.',
      );
    }

    const data = (await response.json()) as unknown;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('Resposta inválida da API do Cosmos.');
    }

    return data as Record<string, unknown>;
  }
}
