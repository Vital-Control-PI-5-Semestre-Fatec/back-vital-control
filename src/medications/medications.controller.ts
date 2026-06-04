import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Roles, UserRole } from '../common/auth';
import { MedicationsService } from './medications.service';

enum RegistrationSource {
  MANUAL = 'MANUAL',
  COSMOS = 'COSMOS',
}

enum StockAdjustmentType {
  PURCHASE = 'PURCHASE',
  MANUAL_ADJUSTMENT_IN = 'MANUAL_ADJUSTMENT_IN',
  MANUAL_ADJUSTMENT_OUT = 'MANUAL_ADJUSTMENT_OUT',
  DISCARD = 'DISCARD',
}

class CreateMedicationDto {
  @IsString()
  name!: string;

  @IsString()
  dosageDescription!: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(RegistrationSource)
  registrationSource?: RegistrationSource;
}

class UpdateMedicationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  dosageDescription?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(RegistrationSource)
  registrationSource?: RegistrationSource;
}

class StockAdjustmentDto {
  @IsEnum(StockAdjustmentType)
  type!: StockAdjustmentType;

  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('patients/:patientId/medications')
export class MedicationsController {
  constructor(
    private readonly service: MedicationsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    await this.access.assertPatientReadAccess(user, patientId);
    return this.service.list(patientId);
  }

  @Roles(UserRole.PATIENT)
  @Post()
  create(
    @Param('patientId') patientId: string,
    @Body() body: CreateMedicationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.create(patientId, body, user);
  }

  @Roles(UserRole.PATIENT)
  @Patch(':medicationId')
  update(
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
    @Body() body: UpdateMedicationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.update(patientId, medicationId, body);
  }

  @Roles(UserRole.PATIENT)
  @Patch(':medicationId/deactivate')
  deactivate(
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.deactivate(patientId, medicationId);
  }

  @Get(':medicationId/movements')
  async movements(
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    await this.access.assertPatientReadAccess(user, patientId);
    return this.service.movementsFor(patientId, medicationId);
  }

  @Roles(UserRole.PATIENT)
  @Patch(':medicationId/stock')
  adjust(
    @Param('patientId') patientId: string,
    @Param('medicationId') medicationId: string,
    @Body() body: StockAdjustmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<unknown> {
    this.access.assertPatientWriteAccess(user, patientId);
    return this.service.adjust(patientId, medicationId, body, user);
  }

  @Get('search-barcode/:barcode')
  async searchBarcode(
    @Param('patientId') patientId: string,
    @Param('barcode') barcode: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    await this.access.assertPatientReadAccess(user, patientId);
    return this.service.searchCosmos(barcode);
  }
}
