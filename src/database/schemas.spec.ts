import {
  formatNameInitials,
  mapAuditLog,
  mapCareGroup,
  mapLgpdDataRequest,
  mapMedication,
  mapPatientProfile,
  mapUser,
  mapUserConsent,
} from './schemas';
import { UserRole } from '../common/auth';

describe('Database Schemas & Data Integrity (LGPD & Privacy)', () => {
  describe('formatNameInitials (Minimização e Pseudonimização Hospitalar LGPD)', () => {
    it('deve converter nomes completos em iniciais hospitalares padronizadas', () => {
      expect(formatNameInitials('Heitor Silva Moura')).toBe('H.S.M.');
      expect(formatNameInitials('Ana Paula')).toBe('A.P.');
      expect(formatNameInitials('Carlos Eduardo Santos')).toBe('C.E.S.');
    });

    it('deve ignorar partículas de ligação (de, da, do, das, dos, e)', () => {
      expect(formatNameInitials('Beatriz de Oliveira')).toBe('B.O.');
      expect(formatNameInitials('Lucas da Silva e Souza')).toBe('L.S.S.');
      expect(formatNameInitials('Maria das Dores')).toBe('M.D.');
      expect(formatNameInitials('João dos Santos')).toBe('J.S.');
    });

    it('deve lidar com espaços extras no início, meio e fim', () => {
      expect(formatNameInitials('   Mariana   Alves   ')).toBe('M.A.');
    });

    it('deve retornar "S/P" (Sem Paciente) se o nome for nulo ou vazio', () => {
      expect(formatNameInitials('')).toBe('S/P');
      expect(formatNameInitials('   ')).toBe('S/P');
      expect(formatNameInitials(undefined)).toBe('S/P');
    });
  });

  describe('Data Mappers (Integridade Relacional PostgREST -> API Contract)', () => {
    it('mapUser deve mapear campos do banco snake_case para objeto camelCase', () => {
      const row = {
        id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        name: 'Alisson Paciente',
        email: 'alisson@vitalcontrol.com.br',
        password_hash: 'salt:hash123',
        role: 'PATIENT',
        status: 'ACTIVE',
        created_at: '2026-11-13T10:00:00Z',
        updated_at: '2026-11-13T10:00:00Z',
      };

      const mapped = mapUser(row);
      expect(mapped.id).toBe(row.id);
      expect(mapped.name).toBe('Alisson Paciente');
      expect(mapped.role).toBe(UserRole.PATIENT);
      expect(mapped.passwordHash).toBe('salt:hash123');
      expect(mapped.status).toBe('ACTIVE');
    });

    it('mapPatientProfile deve preservar dados clínicos sensíveis com tipos corretos', () => {
      const row = {
        id: '11111111-1111-1111-1111-111111111111',
        patient_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        blood_type: 'O+',
        weight_kg: 72.5,
        height_cm: 175,
        allergies: ['Dipirona', 'Penicilina'],
        pre_existing_conditions: ['Hipertensão'],
        default_address: { city: 'São Paulo', street: 'Av. Paulista' },
        emergency_contacts: [{ name: 'Maria', phone: '11999999999' }],
        timezone: 'America/Sao_Paulo',
      };

      const mapped = mapPatientProfile(row);
      expect(mapped.bloodType).toBe('O+');
      expect(mapped.weightKg).toBe(72.5);
      expect(mapped.heightCm).toBe(175);
      expect(mapped.allergies).toContain('Dipirona');
      expect(mapped.preExistingConditions).toContain('Hipertensão');
      expect(mapped.defaultAddress?.city).toBe('São Paulo');
    });

    it('mapMedication deve garantir conversão numérica de estoque e integridade', () => {
      const row = {
        id: '22222222-2222-2222-2222-222222222222',
        patient_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        name: 'Losartana Potássica',
        dosage_description: '50mg via oral pela manhã',
        stock: { currentQuantity: '30', unit: 'comprimidos', lowStockThreshold: '5' },
        active: true,
      };

      const mapped = mapMedication(row);
      expect(mapped.name).toBe('Losartana Potássica');
      expect(mapped.stock.currentQuantity).toBe(30);
      expect(typeof mapped.stock.currentQuantity).toBe('number');
      expect(mapped.stock.lowStockThreshold).toBe(5);
      expect(mapped.active).toBe(true);
    });

    it('mapUserConsent (RF01) deve mapear termos de consentimento e data de revogação', () => {
      const row = {
        id: '33333333-3333-3333-3333-333333333333',
        user_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        purpose: 'TRATAMENTO_DADOS_SAUDE',
        consented: false,
        version: '1.0',
        consented_at: '2026-11-13T10:00:00Z',
        revoked_at: '2026-11-13T12:00:00Z',
        created_at: '2026-11-13T10:00:00Z',
      };

      const mapped = mapUserConsent(row);
      expect(mapped.purpose).toBe('TRATAMENTO_DADOS_SAUDE');
      expect(mapped.consented).toBe(false);
      expect(mapped.revokedAt).toBe('2026-11-13T12:00:00Z');
      expect(mapped.version).toBe('1.0');
    });

    it('mapLgpdDataRequest (RF02) deve mapear solicitações do titular com status correto', () => {
      const row = {
        id: '44444444-4444-4444-4444-444444444444',
        user_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        request_type: 'ACCESS_EXPORT',
        details: 'Desejo exportar cópia de todo o meu prontuário',
        status: 'PENDING',
        created_at: '2026-11-13T10:00:00Z',
      };

      const mapped = mapLgpdDataRequest(row);
      expect(mapped.requestType).toBe('ACCESS_EXPORT');
      expect(mapped.status).toBe('PENDING');
      expect(mapped.details).toContain('prontuário');
    });

    it('mapAuditLog (RF08) deve mapear registros da trilha com integridade', () => {
      const row = {
        id: '55555555-5555-5555-5555-555555555555',
        actor_user_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        action: 'MEDICATION_DOSE_RECORDED',
        resource_type: 'MEDICATION_ADMINISTRATION',
        resource_id: '66666666-6666-6666-6666-666666666666',
        patient_id: '81a65f92-6418-4cb2-bf53-d94d5fa1328a',
        occurred_at: '2026-11-13T10:30:00Z',
        metadata: { status: 'TAKEN_ON_TIME', dose: 1 },
      };

      const mapped = mapAuditLog(row);
      expect(mapped.action).toBe('MEDICATION_DOSE_RECORDED');
      expect(mapped.actorUserId).toBe(row.actor_user_id);
      expect(mapped.resourceType).toBe('MEDICATION_ADMINISTRATION');
      expect(mapped.metadata).toEqual({ status: 'TAKEN_ON_TIME', dose: 1 });
    });
  });
});

