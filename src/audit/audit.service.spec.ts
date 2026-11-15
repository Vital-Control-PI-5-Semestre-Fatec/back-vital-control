import { AuditService } from './audit.service';
import { SupabaseService } from '../database/supabase.service';

describe('AuditService (Trilha de Auditoria e Imutabilidade - RF08, RF09, RF10)', () => {
  let service: AuditService;
  let mockSupabase: any;

  const validUserId = '81a65f92-6418-4cb2-bf53-d94d5fa1328a';

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: jest.fn(),
      },
    };
    service = new AuditService(mockSupabase as SupabaseService);
  });

  describe('record (Registro de Ações Críticas - RF08 & RF09 Append-Only)', () => {
    it('deve gravar log crítico com quem, o quê, quando e metadados contextuais', async () => {
      const insertBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '55555555-5555-4555-a555-555555555555',
            actor_user_id: validUserId,
            action: 'MEDICATION_CREATED',
            resource_type: 'MEDICATION',
            resource_id: '66666666-6666-4666-a666-666666666666',
            patient_id: validUserId,
            occurred_at: '2026-11-15T13:00:00Z',
            metadata: { name: 'Paracetamol 500mg' },
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(insertBuilder);

      const log = await service.record({
        actorUserId: validUserId,
        action: 'MEDICATION_CREATED',
        resourceType: 'MEDICATION',
        resourceId: '66666666-6666-4666-a666-666666666666',
        patientId: validUserId,
        metadata: { name: 'Paracetamol 500mg' },
      });

      expect(log).toBeDefined();
      expect(log?.action).toBe('MEDICATION_CREATED');
      expect(log?.actorUserId).toBe(validUserId);
      expect(log?.metadata).toEqual({ name: 'Paracetamol 500mg' });

      // Garante inserção direta na tabela audit_logs (append-only)
      expect(mockSupabase.client.from).toHaveBeenCalledWith('audit_logs');
    });

    it('deve rejeitar e retornar null se dados obrigatórios da auditoria estiverem ausentes', async () => {
      expect(await service.record({ actorUserId: '', action: 'ACTION', resourceType: 'RES' })).toBeNull();
      expect(await service.record({ actorUserId: validUserId, action: '', resourceType: 'RES' })).toBeNull();
      expect(await service.record({ actorUserId: validUserId, action: 'ACTION', resourceType: '' })).toBeNull();
      expect(mockSupabase.client.from).not.toHaveBeenCalled();
    });

    it('deve ser resiliente e não propagar exceção caso o banco de auditoria falhe', async () => {
      const insertBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('Falha de conexão com banco de logs')),
      };

      mockSupabase.client.from.mockReturnValue(insertBuilder);

      const result = await service.record({
        actorUserId: validUserId,
        action: 'LGPD_CONSENT_GRANTED',
        resourceType: 'USER_CONSENT',
      });

      expect(result).toBeNull();
    });
  });

  describe('list (Consulta Autorizada por Gestor/Auditor - RF10)', () => {
    it('deve listar registros ordenados por data decrescente com filtros de pesquisa', async () => {
      const mockLogs = [
        {
          id: '1',
          actor_user_id: validUserId,
          action: 'USER_LOGIN_SUCCESS',
          resource_type: 'AUTH',
          occurred_at: '2026-11-15T12:00:00Z',
        },
      ];

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: mockLogs, error: null }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      const logs = await service.list({
        actorUserId: validUserId,
        resourceType: 'AUTH',
        limit: 10,
      });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('USER_LOGIN_SUCCESS');
      expect(queryBuilder.order).toHaveBeenCalledWith('occurred_at', { ascending: false });
      expect(queryBuilder.eq).toHaveBeenCalledWith('actor_user_id', validUserId);
      expect(queryBuilder.eq).toHaveBeenCalledWith('resource_type', 'AUTH');
      expect(queryBuilder.limit).toHaveBeenCalledWith(10);
    });
  });
});

