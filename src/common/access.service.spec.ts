import { ForbiddenException } from '@nestjs/common';
import { AccessService } from './access.service';
import { AuthUser, UserRole } from './auth';
import { SupabaseService } from '../database/supabase.service';

describe('AccessService (RBAC & Privacy by Design - RF05)', () => {
  let service: AccessService;
  let mockSupabase: any;

  const validPatientId = '81a65f92-6418-4cb2-bf53-d94d5fa1328a';
  const validCaregiverId = '99999999-9999-4999-a999-999999999999';
  const validManagerId = '88888888-8888-4888-a888-888888888888';

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: jest.fn(),
      },
    };
    service = new AccessService(mockSupabase as SupabaseService);
  });

  describe('assertPatientReadAccess (Restrição de acesso a prontuário e dados pessoais)', () => {
    it('deve permitir acesso imediato se o usuário for o próprio paciente (titular dos dados)', async () => {
      const user: AuthUser = {
        userId: validPatientId,
        role: UserRole.PATIENT,
      };

      await expect(service.assertPatientReadAccess(user, validPatientId)).resolves.toBeUndefined();
      expect(mockSupabase.client.from).not.toHaveBeenCalled();
    });

    it('deve permitir acesso a cuidador se vinculado ao grupo de cuidado ativo do paciente', async () => {
      const user: AuthUser = {
        userId: validCaregiverId,
        role: UserRole.CAREGIVER,
      };

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ count: 1, error: null }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      await expect(service.assertPatientReadAccess(user, validPatientId)).resolves.toBeUndefined();
      expect(mockSupabase.client.from).toHaveBeenCalledWith('care_groups');
      expect(queryBuilder.contains).toHaveBeenCalledWith('caregiver_ids', [validCaregiverId]);
    });

    it('deve rejeitar com ForbiddenException se o cuidador NÃO estiver no grupo de cuidado do paciente', async () => {
      const user: AuthUser = {
        userId: validCaregiverId,
        role: UserRole.CAREGIVER,
      };

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ count: 0, error: null }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      await expect(service.assertPatientReadAccess(user, validPatientId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve permitir acesso a gestor de cuidado ativo do paciente', async () => {
      const user: AuthUser = {
        userId: validManagerId,
        role: UserRole.CARE_MANAGER,
      };

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ count: 1, error: null }),
      };

      mockSupabase.client.from.mockReturnValue(queryBuilder);

      await expect(service.assertPatientReadAccess(user, validPatientId)).resolves.toBeUndefined();
      expect(queryBuilder.eq).toHaveBeenCalledWith('manager_id', validManagerId);
    });

    it('deve rejeitar imediatamente se o identificador do paciente for um UUID malicioso ou inválido', async () => {
      const user: AuthUser = {
        userId: validCaregiverId,
        role: UserRole.CAREGIVER,
      };

      await expect(service.assertPatientReadAccess(user, "1' OR '1'='1")).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.assertPatientReadAccess(user, 'invalid-uuid-format')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertPatientWriteAccess (Proteção contra alteração indevida de dados do titular)', () => {
    it('deve permitir alteração se o usuário for o próprio titular paciente', () => {
      const user: AuthUser = {
        userId: validPatientId,
        role: UserRole.PATIENT,
      };

      expect(() => service.assertPatientWriteAccess(user, validPatientId)).not.toThrow();
    });

    it('deve bloquear qualquer tentativa de escrita de cuidadores ou terceiros em dados do titular', () => {
      const caregiverUser: AuthUser = {
        userId: validCaregiverId,
        role: UserRole.CAREGIVER,
      };

      expect(() => service.assertPatientWriteAccess(caregiverUser, validPatientId)).toThrow(
        ForbiddenException,
      );
    });
  });
});
