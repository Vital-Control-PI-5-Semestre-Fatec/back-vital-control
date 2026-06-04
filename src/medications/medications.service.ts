import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config'; // adicionado
import { Connection, Model } from 'mongoose';
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
  registrationSource?: string;
}

@Injectable()
export class MedicationsService {
  constructor(
    @InjectModel(Medication.name) private readonly medications: Model<Medication>,
    @InjectModel(StockMovement.name) private readonly movements: Model<StockMovement>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService, // adicionado
  ) {}

  list(patientId: string) { return this.medications.find({ patientId }).sort({ createdAt: -1 }); }
  movementsFor(patientId: string, medicationId: string) { return this.movements.find({ patientId, medicationId }).sort({ occurredAt: -1 }); }

  async create(patientId: string, input: CreateMedicationInput, user: AuthUser) {
    const quantity = Number(input.currentQuantity ?? 0);
    if (quantity < 0) throw new BadRequestException('Saldo inicial inválido');
    const medication = new this.medications({
      patientId, name: input.name, dosageDescription: input.dosageDescription,
      barcode: input.barcode, brand: input.brand, notes: input.notes,
      registrationSource: input.registrationSource, stock: {
        currentQuantity: quantity, unit: input.unit, lowStockThreshold: input.lowStockThreshold,
      },
    });
    await medication.save();
    if (quantity > 0) await this.movements.create({ patientId, medicationId: medication._id, type: 'INITIAL_BALANCE', direction: 'IN', quantity, stockBefore: 0, stockAfter: quantity, performedByUserId: user.userId });
    return medication;
  }

  async adjust(patientId: string, medicationId: string, input: { type: string; quantity: number; reason?: string }, user: AuthUser) {
    const incoming = ['PURCHASE', 'MANUAL_ADJUSTMENT_IN'].includes(input.type);
    const outgoing = ['MANUAL_ADJUSTMENT_OUT', 'DISCARD'].includes(input.type);
    if (!incoming && !outgoing) throw new BadRequestException('Tipo de movimentação inválido');
    if (input.quantity <= 0) throw new BadRequestException('Quantidade deve ser positiva');
    const medication = await this.medications.findOne({ _id: medicationId, patientId, active: true });
    if (!medication) throw new NotFoundException('Medicamento não encontrado');
    const before = medication.stock.currentQuantity;
    const after = before + (incoming ? input.quantity : -input.quantity);
    if (after < 0) throw new BadRequestException('Estoque insuficiente');
    medication.stock.currentQuantity = after;
    medication.markModified('stock');
    await medication.save();
    await this.movements.create({ patientId, medicationId, type: input.type, direction: incoming ? 'IN' : 'OUT', quantity: input.quantity, stockBefore: before, stockAfter: after, reason: input.reason, performedByUserId: user.userId });
    return medication;
  }

  async consumeForAdministration(patientId: string, medicationId: string, administrationId: string, quantity: number, userId: string) {
    const existing = await this.movements.exists({ administrationId });
    if (existing) return;
    const medication = await this.medications.findOneAndUpdate(
      { _id: medicationId, patientId, 'stock.currentQuantity': { $gte: quantity } },
      { $inc: { 'stock.currentQuantity': -quantity } },
      { new: false },
    );
    if (!medication) throw new BadRequestException('Estoque insuficiente');
    const before = medication.stock.currentQuantity;
    await this.movements.create({ patientId, medicationId, administrationId, type: 'ADMINISTRATION', direction: 'OUT', quantity, stockBefore: before, stockAfter: before - quantity, performedByUserId: userId });
  }

  // COSMOS via fetch nativo — nenhuma dependência nova
  async searchCosmos(barcode: string) {
    const baseUrl = this.configService.get<string>('COSMOS_API_URL');
    const token = this.configService.get<string>('COSMOS_API_TOKEN');

    if (!baseUrl || !token) throw new BadRequestException('Credenciais do Cosmos não configuradas no servidor.');

    const response = await fetch(`${baseUrl}/${barcode}.json`, {
      headers: { 'X-Cosmos-Token': token },
    });

    if (response.status === 404) throw new NotFoundException('Medicamento não encontrado na base do Cosmos.');
    if (!response.ok) throw new BadRequestException('Não foi possível comunicar com a API do Cosmos no momento.');

    return response.json();
  }
}