import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { MedicationsService } from './medications.service';

class CreateMedicationDto {
  @IsString() name: string;
  @IsString() dosageDescription: string;
  @IsString() unit: string;
  @IsOptional() @IsNumber() @Min(0) currentQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) lowStockThreshold?: number;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(['MANUAL', 'COSMOS']) registrationSource?: string; // removido ANVISA e COSMOS_ANVISA
}
class StockAdjustmentDto {
  @IsEnum(['PURCHASE', 'MANUAL_ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT_OUT', 'DISCARD']) type: string;
  @IsNumber() @Min(0.000001) quantity: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller('patients/:patientId/medications')
export class MedicationsController {
  constructor(private readonly service: MedicationsService, private readonly access: AccessService) {}

  @Get() async list(@Param('patientId') id: string, @CurrentUser() user: AuthUser) { await this.access.assertPatientReadAccess(user, id); return this.service.list(id); }
  @Roles(UserRole.PATIENT) @Post() create(@Param('patientId') id: string, @Body() body: CreateMedicationDto, @CurrentUser() user: AuthUser) { this.access.assertPatientWriteAccess(user, id); return this.service.create(id, body, user); }
  @Get(':medicationId/movements') async movements(@Param('patientId') id: string, @Param('medicationId') medicationId: string, @CurrentUser() user: AuthUser) { await this.access.assertPatientReadAccess(user, id); return this.service.movementsFor(id, medicationId); }
  @Roles(UserRole.PATIENT) @Patch(':medicationId/stock') adjust(@Param('patientId') id: string, @Param('medicationId') medicationId: string, @Body() body: StockAdjustmentDto, @CurrentUser() user: AuthUser) { this.access.assertPatientWriteAccess(user, id); return this.service.adjust(id, medicationId, body, user); }

  // ROTA COSMOS
  @Get('search-barcode/:barcode')
  async searchBarcode(@Param('patientId') id: string, @Param('barcode') barcode: string, @CurrentUser() user: AuthUser) {
    await this.access.assertPatientReadAccess(user, id);
    return this.service.searchCosmos(barcode);
  }
}