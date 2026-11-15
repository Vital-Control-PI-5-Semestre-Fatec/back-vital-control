import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { SupabaseService } from '../database/supabase.service';
import { AuditService } from '../audit/audit.service';
import {
  LgpdDataRequest,
  mapLgpdDataRequest,
  mapPatientProfile,
  mapUser,
  mapUserConsent,
  PatientProfile,
  User,
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
  async exportMyData(
    userId: string,
    format: 'JSON' | 'CSV' | 'PDF' = 'JSON',
  ): Promise<Record<string, unknown>> {
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
        format,
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

  /**
   * RF02: Exportação em CSV (Portabilidade de dados e leitura em planilhas / Excel - Art. 18, V).
   */
  async exportMyDataCsv(userId: string): Promise<string> {
    const dossier = await this.exportMyData(userId, 'CSV');
    const u = dossier.user as User | null;
    const p = dossier.clinicalProfile as PatientProfile | null;
    const meds = (dossier.medications as Array<Record<string, unknown>>) || [];
    const scheds = (dossier.medicationSchedules as Array<Record<string, unknown>>) || [];
    const admins = (dossier.recentAdministrations as Array<Record<string, unknown>>) || [];
    const consents = (dossier.consentsHistory as UserConsent[]) || [];
    const requests = (dossier.dataSubjectRequests as LgpdDataRequest[]) || [];

    const lines: string[] = [];
    lines.push('\uFEFF'); // BOM para suporte a caracteres acentuados no Excel

    lines.push('=== DOSSIÊ DE DADOS DO TITULAR (LGPD - LEI 13.709/2018) ===');
    lines.push(`Emitido em;${dossier.exportedAt}`);
    lines.push(`Base Legal;${dossier.legalBasis}`);
    lines.push('');

    lines.push('--- DADOS CADASTRAIS (ART. 18) ---');
    lines.push('Campo;Valor');
    lines.push(`Identificador Único (ID);${u?.id ?? 'N/D'}`);
    lines.push(`Nome Completo;${u?.name ?? 'N/D'}`);
    lines.push(`E-mail;${u?.email ?? 'N/D'}`);
    lines.push(`Perfil de Acesso;${u?.role ?? 'N/D'}`);
    lines.push(`Status da Conta;${u?.status ?? 'N/D'}`);
    lines.push(`Data de Criação;${u?.createdAt ?? 'N/D'}`);
    lines.push('');

    const emergencyStr =
      p?.emergencyContacts && p.emergencyContacts.length > 0
        ? p.emergencyContacts.map((c) => `${c.name} (${c.phone})`).join(', ')
        : 'N/D';

    lines.push('--- PERFIL CLÍNICO / PRONTUÁRIO ---');
    lines.push('Campo;Valor');
    lines.push(`Tipo Sanguíneo;${p?.bloodType ?? 'Não informado'}`);
    lines.push(`Alergias;${p?.allergies && p.allergies.length > 0 ? `"${p.allergies.join(', ')}"` : 'Nenhuma'}`);
    lines.push(`Condições Pré-existentes;${p?.preExistingConditions && p.preExistingConditions.length > 0 ? `"${p.preExistingConditions.join(', ')}"` : 'Nenhuma'}`);
    lines.push(`Contatos de Emergência;${emergencyStr}`);
    lines.push('');

    lines.push('--- MEDICAMENTOS CADASTRADOS ---');
    lines.push('Nome do Medicamento;Dosagem;Instruções;Observações');
    if (meds.length === 0) {
      lines.push('Nenhum medicamento registrado;;;');
    } else {
      for (const m of meds) {
        lines.push(`"${String(m.name ?? '')}";"${String(m.dosage_description ?? m.dosage ?? '')}";"${String(m.instructions ?? '')}";"${String(m.notes ?? '')}"`);
      }
    }
    lines.push('');

    lines.push('--- AGENDAMENTOS E ROTINAS ---');
    lines.push('Medicamento ID;Horário Previsto;Dose;Instruções');
    if (scheds.length === 0) {
      lines.push('Nenhum agendamento registrado;;;');
    } else {
      for (const s of scheds) {
        lines.push(`"${String(s.medication_id ?? '')}";"${String(s.scheduled_time ?? s.time ?? '')}";"${String(s.dosage ?? '')}";"${String(s.instructions ?? '')}"`);
      }
    }
    lines.push('');

    lines.push('--- HISTÓRICO DE ADMINISTRAÇÕES RECENTES ---');
    lines.push('Agendamento ID;Horário Previsto;Horário Realizado;Status;Administrado Por');
    if (admins.length === 0) {
      lines.push('Nenhuma administração registrada;;;;');
    } else {
      for (const a of admins) {
        lines.push(`"${String(a.schedule_id ?? '')}";"${String(a.scheduled_for ?? '')}";"${String(a.administered_at ?? '')}";"${String(a.status ?? '')}";"${String(a.administered_by ?? '')}"`);
      }
    }
    lines.push('');

    lines.push('--- HISTÓRICO DE CONSENTIMENTOS LGPD ---');
    lines.push('Finalidade;Autorizado;Data de Registro;Data de Revogação');
    if (consents.length === 0) {
      lines.push('Nenhum consentimento registrado;;;');
    } else {
      for (const c of consents) {
        lines.push(`"${c.purpose}";"${c.consented ? 'AUTORIZADO' : 'REVOGADO'}";"${c.createdAt ?? c.consentedAt}";"${c.revokedAt ?? 'Ativo'}"`);
      }
    }
    lines.push('');

    lines.push('--- PROTOCOLOS E SOLICITAÇÕES DO TITULAR (ART. 18) ---');
    lines.push('Protocolo ID;Tipo;Status;Detalhes;Data de Abertura;Data de Resposta');
    if (requests.length === 0) {
      lines.push('Nenhuma solicitação registrada;;;;;');
    } else {
      for (const r of requests) {
        lines.push(`"${r.id ?? ''}";"${r.requestType}";"${r.status}";"${(r.details ?? '').replace(/"/g, '""')}";"${r.createdAt ?? ''}";"${r.updatedAt ?? 'Em andamento'}"`);
      }
    }

    return lines.join('\r\n');
  }

  /**
   * RF02: Exportação em PDF (Dossiê oficial formatado para leitura humana, impressão e comprovação médica - Art. 19, II).
   */
  async exportMyDataPdf(userId: string): Promise<Buffer> {
    const dossier = await this.exportMyData(userId, 'PDF');
    const u = dossier.user as User | null;
    const p = dossier.clinicalProfile as PatientProfile | null;
    const meds = (dossier.medications as Array<Record<string, unknown>>) || [];
    const consents = (dossier.consentsHistory as UserConsent[]) || [];
    const requests = (dossier.dataSubjectRequests as LgpdDataRequest[]) || [];

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const primaryColor = '#0284c7'; // Azul Vital Control
        const darkColor = '#0f172a';
        const mutedColor = '#64748b';
        const borderColor = '#cbd5e1';

        // Cabeçalho institucional
        doc.rect(40, 40, 515, 60).fill('#f0f9ff');
        doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold')
           .text('VITAL CONTROL - GESTÃO EM SAÚDE', 55, 52);
        doc.fillColor(darkColor).fontSize(11).font('Helvetica')
           .text('Dossiê de Dados do Titular (LGPD - Lei nº 13.709/2018)', 55, 73);
        doc.fillColor(mutedColor).fontSize(8)
           .text(`Emissão: ${new Date().toLocaleString('pt-BR')} | Base Legal: Art. 18, II e V`, 55, 87);

        doc.moveDown(3);

        const addSectionHeader = (title: string) => {
          doc.moveDown(0.8);
          doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text(title);
          doc.strokeColor(borderColor).lineWidth(1).moveTo(doc.x, doc.y + 2).lineTo(555, doc.y + 2).stroke();
          doc.moveDown(0.4);
        };

        const addField = (label: string, value: string) => {
          doc.fillColor(mutedColor).fontSize(9).font('Helvetica-Bold').text(`${label}: `, { continued: true });
          doc.fillColor(darkColor).font('Helvetica').text(value || 'N/D');
        };

        // 1. Dados Cadastrais
        addSectionHeader('1. Dados Cadastrais do Titular');
        addField('Nome Completo', u?.name ?? 'N/D');
        addField('E-mail Cadastrado', u?.email ?? 'N/D');
        addField('Perfil de Acesso', u?.role ?? 'N/D');
        addField('Status da Conta', u?.status ?? 'N/D');
        addField('Data de Cadastro', u?.createdAt ? new Date(u.createdAt).toLocaleString('pt-BR') : 'N/D');
        addField('Identificador Único (ID)', u?.id ?? 'N/D');

        // 2. Prontuário Clínico
        addSectionHeader('2. Perfil Clínico e Prontuário');
        addField('Tipo Sanguíneo', p?.bloodType ?? 'Não informado');
        addField(
          'Alergias Conhecidas',
          p?.allergies && p.allergies.length > 0 ? p.allergies.join(', ') : 'Nenhuma alergia registrada',
        );
        addField(
          'Condições Pré-existentes',
          p?.preExistingConditions && p.preExistingConditions.length > 0
            ? p.preExistingConditions.join(', ')
            : 'Nenhuma condição registrada',
        );

        const emergencyContactsStr =
          p?.emergencyContacts && p.emergencyContacts.length > 0
            ? p.emergencyContacts.map((c) => `${c.name} (${c.phone})`).join(', ')
            : 'N/D';
        addField('Contatos de Emergência', emergencyContactsStr);

        // 3. Medicamentos Cadastrados
        addSectionHeader('3. Medicamentos em Uso');
        if (meds.length === 0) {
          doc.fillColor(mutedColor).fontSize(9).font('Helvetica-Oblique').text('Nenhum medicamento registrado para este paciente.');
        } else {
          meds.forEach((m, idx) => {
            doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold')
               .text(`${idx + 1}. ${String(m.name ?? 'Medicamento')} - Dosagem: ${String(m.dosage_description ?? m.dosage ?? 'N/D')}`);
            if (m.instructions) {
              doc.fillColor(mutedColor).fontSize(8).font('Helvetica').text(`   Instruções: ${String(m.instructions)}`);
            }
          });
        }

        // 4. Consentimentos LGPD (RF01)
        addSectionHeader('4. Histórico de Consentimentos (Art. 8º da LGPD)');
        if (consents.length === 0) {
          doc.fillColor(mutedColor).fontSize(9).font('Helvetica-Oblique').text('Nenhum consentimento específico registrado.');
        } else {
          consents.forEach((c) => {
            const statusStr = c.consented ? 'AUTORIZADO' : 'REVOGADO';
            const statusColor = c.consented ? '#059669' : '#dc2626';
            doc.fillColor(statusColor).fontSize(9).font('Helvetica-Bold').text(`• [${statusStr}] `, { continued: true });
            const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : 'N/D';
            doc.fillColor(darkColor).font('Helvetica').text(`${c.purpose} (Atualizado em: ${dateStr})`);
          });
        }

        // 5. Solicitações de Titular (RF02)
        addSectionHeader('5. Protocolos e Solicitações do Titular (Art. 18 da LGPD)');
        if (requests.length === 0) {
          doc.fillColor(mutedColor).fontSize(9).font('Helvetica-Oblique').text('Nenhuma solicitação formal registrada pelo titular.');
        } else {
          requests.forEach((r) => {
            const reqId = r.id ? `${r.id.slice(0, 8)}...` : 'S/N';
            doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold')
               .text(`• Protocolo ${reqId} - Tipo: ${r.requestType} - Status: ${r.status}`);
            if (r.details) {
              doc.fillColor(mutedColor).fontSize(8).font('Helvetica').text(`   Detalhes: ${r.details}`);
            }
          });
        }

        // Rodapé de Integridade
        doc.moveDown(2);
        doc.strokeColor(borderColor).lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);
        doc.fillColor(mutedColor).fontSize(7).font('Helvetica')
           .text(
             'Este documento constitui o dossiê oficial de dados pessoais do titular gerado pela plataforma Vital Control em conformidade com os artigos 18 e 19 da Lei Geral de Proteção de Dados (Lei 13.709/2018). Em caso de dúvidas sobre este relatório, contate o Encarregado pelo Tratamento de Dados Pessoais (DPO): dpo@vitalcontrol.com.br.',
             { align: 'justify' },
           );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

