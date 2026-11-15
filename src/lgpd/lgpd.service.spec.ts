import { BadRequestException } from '@nestjs/common';
import { LgpdService } from './lgpd.service';
import { SupabaseService } from '../database/supabase.service';
import { AuditService } from '../audit/audit.service';

describe('LgpdService (Consentimento, Portabilidade & Direitos do Titular - RF01, RF02, RF03)', () => {
  let service: LgpdService;
  let mockSupabase: any;
  let mockAudit: any;

  const validUserId = '81a65f92-6418-4cb2-bf53-d94d5fa1328a';

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: jest.fn(),
      },
    };
    mockAudit = {
      record: jest.fn().mockResolvedValue(null),
    };
    service = new LgpdService(
      mockSupabase as SupabaseService,
      mockAudit as AuditService,
    );
  });

  describe('getPrivacyPolicy (Política de Privacidade Simples - RF03)', () => {
    it('deve retornar a política com bases legais dos Arts. 7º e 11 da LGPD e contato do DPO', () => {
      const policy = service.getPrivacyPolicy();

      expect(policy.title).toContain('Vital Control');
      expect(policy.legalBases).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Consentimento do titular'),
          expect.stringContaining('Tutela da saúde'),
        ]),
      );
      expect(policy.dpoContact.email).toBe('dpo@vitalcontrol.com.br');
      expect(policy.dataSubjectRights.length).toBeGreaterThanOrEqual(4);
      expect(policy.collectedData.some((c) => c.category.includes('Sensíveis'))).toBe(true);
    });
  });

  describe('saveConsent (Registro e Revogação de Consentimento - RF01)', () => {
    it('deve salvar aceite de consentimento e gravar auditoria LGPD_CONSENT_GRANTED', async () => {
      const queryBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '33333333-3333-4333-a333-333333333333',
            user_id: validUserId,
            purpose: 'TRATAMENTO_DADOS_SAUDE',
            consented: true,
            version: '1.0',
            consented_at: new Date().toISOString(),
            revoked_at: null,
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      const result = await service.saveConsent(validUserId, {
        purpose: 'TRATAMENTO_DADOS_SAUDE',
        consented: true,
      });

      expect(result.consented).toBe(true);
      expect(result.purpose).toBe('TRATAMENTO_DADOS_SAUDE');

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LGPD_CONSENT_GRANTED',
          resourceType: 'USER_CONSENT',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve revogar consentimento e registrar auditoria LGPD_CONSENT_REVOKED', async () => {
      const queryBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '33333333-3333-4333-a333-333333333333',
            user_id: validUserId,
            purpose: 'COMPARTILHAMENTO_CUIDADOR',
            consented: false,
            version: '1.0',
            consented_at: new Date().toISOString(),
            revoked_at: new Date().toISOString(),
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      const result = await service.saveConsent(validUserId, {
        purpose: 'COMPARTILHAMENTO_CUIDADOR',
        consented: false,
      });

      expect(result.consented).toBe(false);
      expect(result.revokedAt).toBeDefined();

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LGPD_CONSENT_REVOKED',
          resourceType: 'USER_CONSENT',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve rejeitar termo se a finalidade (purpose) for vazia', async () => {
      await expect(
        service.saveConsent(validUserId, {
          purpose: '   ',
          consented: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createDataRequest (Direitos do Titular - RF02)', () => {
    it('deve criar solicitação formal de titular para exclusão ou correção', async () => {
      const queryBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '44444444-4444-4444-a444-444444444444',
            user_id: validUserId,
            request_type: 'DELETION',
            details: 'Revogo meus consentimentos e peço anonimização.',
            status: 'PENDING',
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      const result = await service.createDataRequest(validUserId, {
        requestType: 'DELETION',
        details: 'Revogo meus consentimentos e peço anonimização.',
      });

      expect(result.status).toBe('PENDING');
      expect(result.requestType).toBe('DELETION');

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LGPD_REQUEST_DELETION',
          resourceType: 'LGPD_DATA_REQUEST',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve rejeitar solicitação com tipo inválido', async () => {
      await expect(
        service.createDataRequest(validUserId, {
          requestType: 'INVALID_TYPE' as any,
          details: 'Teste',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportMyData (Direito de Acesso e Portabilidade - Art. 18 LGPD)', () => {
    it('deve exportar dossiê estruturado contendo usuário, prontuário, medicamentos e registrar auditoria', async () => {
      const mockChain = (data: any) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      });

      mockSupabase.client.from.mockImplementation((table: string) => {
        if (table === 'users') return mockChain({ id: validUserId, name: 'Paciente Teste', email: 'teste@exemplo.com' });
        if (table === 'patient_profiles') return mockChain({ patient_id: validUserId, allergies: ['Dipirona'] });
        if (table === 'medications') return mockChain([{ id: 'm1', name: 'Losartana' }]);
        if (table === 'medication_schedules') return mockChain([{ id: 's1', title: 'Manhã' }]);
        if (table === 'medication_administrations') return mockChain([]);
        if (table === 'user_consents') return mockChain([{ purpose: 'TRATAMENTO_DADOS_SAUDE', consented: true }]);
        if (table === 'lgpd_data_requests') return mockChain([]);
        return mockChain(null);
      });

      const dossier = await service.exportMyData(validUserId);

      expect(dossier.legalBasis).toContain('Artigo 18');
      expect(dossier.exportedAt).toBeDefined();
      expect(dossier.user).toBeDefined();
      expect(dossier.clinicalProfile).toBeDefined();

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LGPD_DATA_EXPORTED',
          resourceType: 'USER_DATA_DOSSIER',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve exportar dossiê em formato CSV com cabeçalhos compatíveis com Excel e BOM UTF-8', async () => {
      const mockChain = (data: any) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      });

      mockSupabase.client.from.mockImplementation((table: string) => {
        if (table === 'users') return mockChain({ id: validUserId, name: 'Paciente Teste', email: 'teste@exemplo.com' });
        if (table === 'patient_profiles') return mockChain({ patient_id: validUserId, allergies: ['Dipirona'] });
        if (table === 'medications') return mockChain([{ id: 'm1', name: 'Losartana', dosage: '50mg' }]);
        if (table === 'medication_schedules') return mockChain([]);
        if (table === 'medication_administrations') return mockChain([]);
        if (table === 'user_consents') return mockChain([{ purpose: 'TRATAMENTO_DADOS_SAUDE', consented: true }]);
        if (table === 'lgpd_data_requests') return mockChain([]);
        return mockChain(null);
      });

      const csv = await service.exportMyDataCsv(validUserId);

      expect(typeof csv).toBe('string');
      expect(csv.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM
      expect(csv).toContain('DOSSIÊ DE DADOS DO TITULAR');
      expect(csv).toContain('Paciente Teste');
      expect(csv).toContain('teste@exemplo.com');
      expect(csv).toContain('Losartana');
      expect(csv).toContain('TRATAMENTO_DADOS_SAUDE');
    });

    it('deve exportar dossiê em formato PDF binário contendo cabeçalho e estrutura vetorial', async () => {
      const mockChain = (data: any) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      });

      mockSupabase.client.from.mockImplementation((table: string) => {
        if (table === 'users') return mockChain({ id: validUserId, name: 'Paciente Teste', email: 'teste@exemplo.com' });
        if (table === 'patient_profiles') return mockChain({ patient_id: validUserId, allergies: ['Dipirona'] });
        if (table === 'medications') return mockChain([{ id: 'm1', name: 'Losartana' }]);
        if (table === 'medication_schedules') return mockChain([]);
        if (table === 'medication_administrations') return mockChain([]);
        if (table === 'user_consents') return mockChain([{ purpose: 'TRATAMENTO_DADOS_SAUDE', consented: true }]);
        if (table === 'lgpd_data_requests') return mockChain([]);
        return mockChain(null);
      });

      const pdfBuffer = await service.exportMyDataPdf(validUserId);

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);
      // Assinatura mágica de arquivo PDF: "%PDF-"
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});

