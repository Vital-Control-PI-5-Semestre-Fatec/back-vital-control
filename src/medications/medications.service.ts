import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../common/auth';
import { Medication, StockMovement } from '../database/schemas';

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
    @InjectModel(Medication.name)
    private readonly medications: Model<Medication>,

    @InjectModel(StockMovement.name)
    private readonly movements: Model<StockMovement>,

    private readonly configService: ConfigService,
  ) {}

  async list(patientId: string): Promise<unknown> {
    return this.medications.find({ patientId }).sort({ createdAt: -1 }).exec();
  }

  async movementsFor(
    patientId: string,
    medicationId: string,
  ): Promise<unknown> {
    return this.movements
      .find({ patientId, medicationId })
      .sort({ occurredAt: -1 })
      .exec();
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

    const medication = await this.medications.create({
      patientId,
      name: input.name.trim(),
      dosageDescription: input.dosageDescription.trim(),
      barcode: input.barcode,
      brand: input.brand,
      imageUrl: input.imageUrl,
      notes: input.notes,
      registrationSource: input.registrationSource ?? 'MANUAL',
      active: true,
      stock: {
        currentQuantity: quantity,
        unit: input.unit,
        lowStockThreshold,
      },
    });

    if (quantity > 0) {
      await this.movements.create({
        patientId,
        medicationId: medication._id,
        type: 'INITIAL_BALANCE',
        direction: 'IN',
        quantity,
        stockBefore: 0,
        stockAfter: quantity,
        reason: 'Saldo inicial do cadastro',
        performedByUserId: user.userId,
      });
    }

    return medication;
  }

  async update(
    patientId: string,
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<unknown> {
    const medication = await this.medications
      .findOne({ _id: medicationId, patientId })
      .exec();

    if (!medication) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    if (input.name !== undefined) medication.name = input.name.trim();
    if (input.dosageDescription !== undefined) {
      medication.dosageDescription = input.dosageDescription.trim();
    }
    if (input.barcode !== undefined) medication.barcode = input.barcode;
    if (input.brand !== undefined) medication.brand = input.brand;
    if (input.notes !== undefined) medication.notes = input.notes;
    if (input.imageUrl !== undefined) medication.imageUrl = input.imageUrl;
    if (input.registrationSource !== undefined) {
      medication.registrationSource = input.registrationSource;
    }

    if (input.unit !== undefined) {
      medication.stock.unit = input.unit;
      medication.markModified('stock');
    }

    if (input.lowStockThreshold !== undefined) {
      if (input.lowStockThreshold < 0) {
        throw new BadRequestException('Limite de estoque inválido');
      }

      medication.stock.lowStockThreshold = input.lowStockThreshold;
      medication.markModified('stock');
    }

    const savedMedication = await medication.save();

    return savedMedication;
  }

  async deactivate(patientId: string, medicationId: string): Promise<unknown> {
    const medication = await this.medications
      .findOne({ _id: medicationId, patientId })
      .exec();

    if (!medication) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    medication.active = false;

    const savedMedication = await medication.save();

    return savedMedication;
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

    const medication = await this.medications
      .findOne({
        _id: medicationId,
        patientId,
        active: true,
      })
      .exec();

    if (!medication) {
      throw new NotFoundException('Medicamento não encontrado');
    }

    const before = medication.stock.currentQuantity;
    const after = before + (incoming ? input.quantity : -input.quantity);

    if (after < 0) {
      throw new BadRequestException('Estoque insuficiente');
    }

    medication.stock.currentQuantity = after;
    medication.markModified('stock');

    await medication.save();

    await this.movements.create({
      patientId,
      medicationId,
      type: input.type,
      direction: incoming ? 'IN' : 'OUT',
      quantity: input.quantity,
      stockBefore: before,
      stockAfter: after,
      reason: input.reason,
      performedByUserId: user.userId,
    });

    return medication;
  }

  async consumeForAdministration(
    patientId: string,
    medicationId: string,
    administrationId: string,
    quantity: number,
    userId: string,
  ): Promise<void> {
    const existing = await this.movements.exists({ administrationId }).exec();

    if (existing) {
      return;
    }

    const medication = await this.medications
      .findOneAndUpdate(
        {
          _id: medicationId,
          patientId,
          'stock.currentQuantity': { $gte: quantity },
        },
        {
          $inc: { 'stock.currentQuantity': -quantity },
        },
        { new: false },
      )
      .exec();

    if (!medication) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const before = medication.stock.currentQuantity;

    await this.movements.create({
      patientId,
      medicationId,
      administrationId,
      type: 'ADMINISTRATION',
      direction: 'OUT',
      quantity,
      stockBefore: before,
      stockAfter: before - quantity,
      performedByUserId: userId,
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
