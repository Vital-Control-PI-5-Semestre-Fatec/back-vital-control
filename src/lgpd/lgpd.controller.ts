import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser, CurrentUser, Public } from '../common/auth';
import { LgpdService, PrivacyPolicyDoc } from './lgpd.service';
import { LgpdDataRequest, UserConsent } from '../database/schemas';

class SaveConsentDto {
  purpose: string;
  consented: boolean;
  version?: string;
}

class CreateDataRequestDto {
  requestType: 'ACCESS_EXPORT' | 'CORRECTION' | 'DELETION';
  details?: string;
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
   * RF02: Exportar dados pessoais do titular (Direito de Acesso e Portabilidade - Art. 18 LGPD).
   */
  @Get('export-my-data')
  async exportMyData(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>> {
    return this.lgpdService.exportMyData(user.userId);
  }
}

