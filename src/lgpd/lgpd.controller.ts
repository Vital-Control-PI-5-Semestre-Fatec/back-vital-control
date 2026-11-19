import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { AuthGuard, AuthUser, CurrentUser, Public, Roles, UserRole } from '../common/auth';
import { LgpdService, PrivacyPolicyDoc } from './lgpd.service';
import { LgpdDataRequest, UserConsent } from '../database/schemas';

class SaveConsentDto {
  @IsString()
  purpose!: string;

  @IsBoolean()
  consented!: boolean;

  @IsOptional()
  @IsString()
  version?: string;
}

class CreateDataRequestDto {
  @IsString()
  @IsIn(['ACCESS_EXPORT', 'CORRECTION', 'DELETION'])
  requestType!: 'ACCESS_EXPORT' | 'CORRECTION' | 'DELETION';

  @IsOptional()
  @IsString()
  details?: string;
}

class UpdateDataRequestDto {
  @IsString()
  @IsIn(['PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED'])
  status!: 'PENDING' | 'IN_REVIEW' | 'COMPLETED' | 'REJECTED';

  @IsOptional()
  @IsString()
  responseNotes?: string;
}

@Controller('lgpd')
@UseGuards(AuthGuard)
export class LgpdController {
  constructor(private readonly lgpdService: LgpdService) {}

  /**
   * RF03: Política de privacidade simples (1 página) descrevendo dados coletados e finalidade.
   * Rota pública para visualização a qualquer momento pelo titular ou público.
   */
  @Get('privacy-policy')
  @Public()
  getPrivacyPolicy(): PrivacyPolicyDoc {
    return this.lgpdService.getPrivacyPolicy();
  }

  /**
   * RF01: Consulta os consentimentos do usuário logado.
   */
  @Get('consents')
  async listMyConsents(@CurrentUser() user: AuthUser): Promise<UserConsent[]> {
    return this.lgpdService.listConsents(user.userId);
  }

  /**
   * RF01: Registrar consentimento do titular (data/hora, finalidade) com opção de revogação.
   */
  @Post('consents')
  async recordConsent(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveConsentDto,
  ): Promise<UserConsent> {
    return this.lgpdService.saveConsent(user.userId, dto);
  }

  /**
   * RF02: Permitir que o titular solicite acesso, correção ou exclusão dos próprios dados.
   */
  @Post('requests')
  async submitDataRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDataRequestDto,
  ): Promise<LgpdDataRequest> {
    return this.lgpdService.createDataRequest(user.userId, dto);
  }

  /**
   * RF02: Acompanhar status das solicitações do próprio titular.
   */
  @Get('requests/my')
  async listMyDataRequests(@CurrentUser() user: AuthUser): Promise<LgpdDataRequest[]> {
    return this.lgpdService.listDataRequests(user.userId);
  }

  /**
   * RF02/RF13: Gestor/DPO consulta todas as solicitações de titulares para atendimento.
   */
  @Roles(UserRole.CARE_MANAGER)
  @Get('requests')
  async listAllDataRequests(): Promise<LgpdDataRequest[]> {
    return this.lgpdService.listAllDataRequests();
  }

  /**
   * RF02/RF13: Gestor/DPO responde ou altera status da solicitação do titular.
   */
  @Roles(UserRole.CARE_MANAGER)
  @Patch('requests/:id/status')
  async updateDataRequest(
    @Param('id') id: string,
    @Body() dto: UpdateDataRequestDto,
  ): Promise<LgpdDataRequest> {
    return this.lgpdService.updateDataRequest(id, dto.status, dto.responseNotes);
  }

  /**
   * RF02: Exportar dados pessoais do titular em JSON (Portabilidade técnica - Art. 18 LGPD).
   */
  @Get('export-my-data')
  async exportMyData(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>> {
    return this.lgpdService.exportMyData(user.userId, 'JSON');
  }

  /**
   * RF02: Exportar dados pessoais do titular em CSV (Planilha / Excel - Art. 18 LGPD).
   */
  @Get('export-my-data/csv')
  async exportMyDataCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.lgpdService.exportMyDataCsv(user.userId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vital-control-dados-titular.csv"');
    res.status(HttpStatus.OK).send(csv);
  }

  /**
   * RF02: Exportar dados pessoais do titular em PDF (Dossiê oficial formatado - Art. 19 LGPD).
   */
  @Get('export-my-data/pdf')
  async exportMyDataPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.lgpdService.exportMyDataPdf(user.userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="vital-control-dossie-titular.pdf"');
    res.status(HttpStatus.OK).end(pdfBuffer);
  }
}

