import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { AuditService } from '../audit/audit.service';
import {
  LgpdDataRequest,
  mapLgpdDataRequest,
  mapPatientProfile,
  mapUser,
  mapUserConsent,
  UserConsent,
} from '../database/schemas';

export interface PrivacyPolicyDoc {
  title: string;
  version: string;
  lastUpdated: string;
  summary: string;
  legalBases: string[];
  collectedData: { category: string; fields: string[]; purpose: string }[];
  dataSubjectRights: string[];
  securityMeasures: string[];
  retentionPeriod: string;
  dpoContact: { role: string; email: string };
}

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * RF03: Política de privacidade simples (1 página) descrevendo dados coletados e finalidade.
   */
  getPrivacyPolicy(): PrivacyPolicyDoc {
    return {
      title: 'Política de Privacidade e Proteção de Dados - Vital Control',
      version: '1.0.0',
      lastUpdated: '2026-11-13',
      summary:
        'O Vital Control preza pela privacidade, confidencialidade e segurança dos dados pessoais e de saúde de seus usuários em estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).',
      legalBases: [
        'Art. 7º, I (Consentimento do titular)',
        'Art. 11, II, "f" (Tutela da saúde, exclusivamente em procedimento realizado por profissionais de saúde ou serviços de saúde)',
        'Art. 7º, IX (Legítimo interesse do controlador para prevenção a fraudes e segurança)',
      ],
      collectedData: [
        {
          category: 'Dados Cadastrais (Comuns)',
          fields: ['Nome completo', 'E-mail', 'Senha criptografada (hash)', 'Perfil de acesso (RBAC)'],
          purpose: 'Identificação, autenticação e controle de acesso restrito ao sistema.',
        },
        {
          category: 'Dados Sensíveis de Saúde (Art. 5º, II da LGPD)',
          fields: [
            'Tipo sanguíneo',
            'Peso e altura',
            'Alergias conhecidas',
            'Condições de saúde pré-existentes',
            'Medicamentos em uso, dosagens e horários',
            'Histórico de adesão terapêutica (doses tomadas/atrasadas)',
          ],
          purpose:
            'Acompanhamento e suporte ao cuidado do paciente, prevenção de reações adversas e gestão de visitas domiciliares por cuidadores autorizados.',
        },
        {
          category: 'Dados de Contato e Localização',
          fields: ['Endereço padrão para atendimento domiciliar', 'Contatos de emergência (nome e telefone)'],
          purpose: 'Roteirização de visitas domiciliares de cuidadores e comunicação em situações de emergência.',
        },
        {
          category: 'Registros de Auditoria e Acesso',
          fields: ['Identificador do usuário (quem)', 'Ação realizada (o quê)', 'Data/Hora (timestamp)', 'IP/Metadados'],
          purpose: 'Rastreabilidade, conformidade com o Marco Civil da Internet (Art. 15) e auditoria de segurança da informação.',
        },
      ],
      dataSubjectRights: [
        'Confirmação da existência de tratamento e acesso aos dados (Art. 18, I e II)',
        'Correção de dados incompletos, inexatos ou desatualizados (Art. 18, III)',
        'Eliminação dos dados pessoais tratados com consentimento (Art. 18, VI)',
        'Portabilidade e exportação dos dados em formato estruturado (Art. 18, V)',
        'Revogação do consentimento a qualquer momento (Art. 18, IX)',
      ],
      securityMeasures: [
        'Criptografia de senhas com algoritmo de hash seguro e salt rounds',
        'Criptografia de dados sensíveis em repouso (AES-256) e em trânsito (HTTPS/TLS)',
        'Controle de acesso por papel (RBAC: Paciente, Cuidador, Gestor, Responsável)',
        'Minimização e pseudonimização com iniciais hospitalares (ex.: H.S.M.) para proteção visual de dados',
        'Trilha de auditoria estritamente imutável (append-only) impedindo deleção de logs',
      ],
      retentionPeriod:
        'Os dados são mantidos enquanto a conta estiver ativa ou pelo período legal estabelecido pelo Conselho Federal de Medicina / Ministério da Saúde (mínimo de 20 anos para prontuários de saúde).',
      dpoContact: {
        role: 'Encarregado pelo Tratamento de Dados Pessoais (DPO)',
        email: 'dpo@vitalcontrol.com.br',
      },
    };
  }

  /**
   * RF01: Consulta de consentimentos registrados do titular.
   */
  async listConsents(userId: string): Promise<UserConsent[]> {
    const { data, error } = await this.supabase.client
      .from('user_consents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }
    return data.map(mapUserConsent);
  }

  /**
   * RF01: Registrar consentimento do titular (data/hora, finalidade) com opção de revogação.
   */
  async saveConsent(
    userId: string,
    input: { purpose: string; consented: boolean; version?: string },
  ): Promise<UserConsent> {
    if (!input.purpose || !input.purpose.trim()) {
      throw new BadRequestException('A finalidade (purpose) do consentimento é obrigatória.');
    }

    const now = new Date().toISOString();
    const version = input.version ?? '1.0';

    // Se estiver revogando, preenche revoked_at; se estiver consentindo, limpa revoked_at
    const { data, error } = await this.supabase.client
      .from('user_consents')
      .insert({
        user_id: userId,
        purpose: input.purpose.trim(),
        consented: input.consented,
        version,
        consented_at: input.consented ? now : undefined,
        revoked_at: input.consented ? null : now,
      })
      .select()
      .single();

    if (error || !data) {
      this.logger.error(`Erro ao salvar consentimento: ${error?.message}`);
      throw new BadRequestException('Não foi possível registrar o termo de consentimento.');
    }

    // Registra na trilha de auditoria (RF08)
    void this.audit.record({
      actorUserId: userId,
      action: input.consented ? 'LGPD_CONSENT_GRANTED' : 'LGPD_CONSENT_REVOKED',
      resourceType: 'USER_CONSENT',
      resourceId: data.id,
      patientId: userId,
      metadata: {
        purpose: input.purpose,
        consented: input.consented,
        version,
      },
    });

    return mapUserConsent(data);
  }

  /**
   * RF02: Permitir que o titular solicite acesso, correção ou exclusão dos próprios dados.
   */
  async createDataRequest(
    userId: string,
    input: { requestType: 'ACCESS_EXPORT' | 'CORRECTION' | 'DELETION'; details?: string },
  ): Promise<LgpdDataRequest> {
    const validTypes = ['ACCESS_EXPORT', 'CORRECTION', 'DELETION'];
    if (!validTypes.includes(input.requestType)) {
      throw new BadRequestException(`Tipo de solicitação inválido. Opções válidas: ${validTypes.join(', ')}`);
    }

    const { data, error } = await this.supabase.client
      .from('lgpd_data_requests')
      .insert({
        user_id: userId,
        request_type: input.requestType,
        details: input.details?.trim() ?? null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error || !data) {
      this.logger.error(`Erro ao criar solicitação LGPD: ${error?.message}`);
      throw new BadRequestException('Não foi possível registrar a solicitação do titular.');
    }

    // Trilha de auditoria (RF08)
    void this.audit.record({
      actorUserId: userId,
      action: `LGPD_REQUEST_${input.requestType}`,
      resourceType: 'LGPD_DATA_REQUEST',
      resourceId: data.id,
      patientId: userId,
      metadata: {
        requestType: input.requestType,
        details: input.details,
      },
    });

    return mapLgpdDataRequest(data);
  }

  /**
   * RF02: Listar solicitações abertas pelo titular.
   */
  async listDataRequests(userId: string): Promise<LgpdDataRequest[]> {
    const { data, error } = await this.supabase.client
      .from('lgpd_data_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }
    return data.map(mapLgpdDataRequest);
  }

  /**
   * RF02: Exportação imediata do dossiê do titular (Direito de Acesso e Portabilidade - Art. 18, II e V da LGPD).
   */
  async exportMyData(userId: string): Promise<Record<string, unknown>> {
    // 1. Dados cadastrais do usuário
    const { data: userRow } = await this.supabase.client
      .from('users')
      .select('id, name, email, role, status, created_at, updated_at')
      .eq('id', userId)
      .single();

    // 2. Prontuário / Perfil clínico
    const { data: profileRow } = await this.supabase.client
      .from('patient_profiles')
      .select('*')
      .eq('patient_id', userId)
      .maybeSingle();

    // 3. Medicamentos do paciente
    const { data: medications } = await this.supabase.client
      .from('medications')
      .select('*')
      .eq('patient_id', userId);

    // 4. Agendamentos de doses
    const { data: schedules } = await this.supabase.client
      .from('medication_schedules')
      .select('*')
      .eq('patient_id', userId);

    // 5. Histórico de administrações
    const { data: administrations } = await this.supabase.client
      .from('medication_administrations')
      .select('*')
      .eq('patient_id', userId)
      .order('scheduled_for', { ascending: false })
      .limit(100);

    // 6. Histórico de consentimentos LGPD
    const consents = await this.listConsents(userId);

    // 7. Solicitações LGPD registradas
    const requests = await this.listDataRequests(userId);

    // Trilha de auditoria (RF08)
    void this.audit.record({
      actorUserId: userId,
      action: 'LGPD_DATA_EXPORTED',
      resourceType: 'USER_DATA_DOSSIER',
      resourceId: userId,
      patientId: userId,
      metadata: {
        exportTimestamp: new Date().toISOString(),
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      legalBasis: 'LGPD Artigo 18, Incisos II e V (Acesso aos dados e Portabilidade)',
      user: userRow ? mapUser(userRow) : null,
      clinicalProfile: profileRow ? mapPatientProfile(profileRow) : null,
      medications: medications ?? [],
      medicationSchedules: schedules ?? [],
      recentAdministrations: administrations ?? [],
      consentsHistory: consents,
      dataSubjectRequests: requests,
    };
  }
}

