import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { createAccessToken, UserRole } from '../common/auth';
import { SupabaseService } from '../database/supabase.service';
import { AuditService } from '../audit/audit.service';
import { pbkdf2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);

describe('AuthService (Criptografia, Autenticação Segura & Auditoria - RF06, RF08, RF11)', () => {
  let service: AuthService;
  let mockSupabase: any;
  let mockAudit: any;

  const validUserId = '81a65f92-6418-4cb2-bf53-d94d5fa1328a';
  const testSecret = 'secret-key-para-testes-unitarios-minimo-32-chars';

  beforeAll(() => {
    process.env.JWT_SECRET = testSecret;
  });

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: jest.fn(),
      },
    };
    mockAudit = {
      record: jest.fn().mockResolvedValue(null),
    };

    service = new AuthService(
      mockSupabase as SupabaseService,
      mockAudit as AuditService,
    );
  });

  describe('Criptografia em Repouso & Cadastro (RF06 & RF08)', () => {
    it('deve registrar usuário com senha criptografada (hash PBKDF2 + salt) e registrar auditoria', async () => {
      // Mock de verificação de e-mail existente (não existe)
      const selectBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock de insert no banco
      const insertBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: validUserId,
            name: 'Paciente Teste',
            email: 'paciente@vitalcontrol.com.br',
            password_hash: 'mocked_hash',
            role: 'PATIENT',
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      };

      mockSupabase.client.from
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(insertBuilder);

      const res = await service.register({
        name: 'Paciente Teste',
        email: 'paciente@vitalcontrol.com.br',
        password: 'SenhaForte@123',
        role: UserRole.PATIENT,
      });

      expect(res.user.email).toBe('paciente@vitalcontrol.com.br');
      expect(res.accessToken).toBeDefined();

      // Verifica se a senha gravada no banco NÃO é texto puro
      const insertedPayload = insertBuilder.insert.mock.calls[0][0];
      expect(insertedPayload.password_hash).not.toBe('SenhaForte@123');
      expect(insertedPayload.password_hash).toContain(':'); // Formato salt:hash

      // Verifica gravação na trilha de auditoria (RF08)
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_REGISTERED',
          resourceType: 'USER',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve rejeitar cadastro com ConflictException se o e-mail já estiver em uso', async () => {
      const selectBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: validUserId }, error: null }),
      };

      mockSupabase.client.from.mockReturnValueOnce(selectBuilder);

      await expect(
        service.register({
          name: 'Duplicado',
          email: 'existente@vitalcontrol.com.br',
          password: 'SenhaForte@123',
          role: UserRole.PATIENT,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Login & Tentativas Malsucedidas (RF08 & RF11)', () => {
    it('deve realizar login e registrar USER_LOGIN_SUCCESS quando credenciais forem válidas', async () => {
      // Gera hash PBKDF2 real para o teste
      const salt = randomBytes(16).toString('hex');
      const hash = await derive('SenhaCorreta@123', salt, 120000, 32, 'sha256');
      const realPasswordHash = `${salt}:${hash.toString('hex')}`;

      const selectBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: validUserId,
            name: 'Paciente Teste',
            email: 'paciente@vitalcontrol.com.br',
            password_hash: realPasswordHash,
            role: 'PATIENT',
            status: 'ACTIVE',
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(selectBuilder);

      const res = await service.login({
        email: 'paciente@vitalcontrol.com.br',
        password: 'SenhaCorreta@123',
      });

      expect(res.user.id).toBe(validUserId);
      expect(res.accessToken).toBeDefined();

      // Trilha de auditoria (RF08)
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN_SUCCESS',
          resourceType: 'AUTH',
          actorUserId: validUserId,
        }),
      );
    });

    it('deve registrar USER_LOGIN_FAILED (RF11) e lançar UnauthorizedException se a senha for incorreta', async () => {
      const salt = randomBytes(16).toString('hex');
      const hash = await derive('SenhaCorreta@123', salt, 120000, 32, 'sha256');
      const realPasswordHash = `${salt}:${hash.toString('hex')}`;

      const selectBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: validUserId,
            name: 'Paciente Teste',
            email: 'paciente@vitalcontrol.com.br',
            password_hash: realPasswordHash,
            role: 'PATIENT',
            status: 'ACTIVE',
          },
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(selectBuilder);

      await expect(
        service.login({
          email: 'paciente@vitalcontrol.com.br',
          password: 'SenhaErrada@999',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Trilha de auditoria de tentativa de invasão/falha (RF11)
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN_FAILED',
          resourceType: 'AUTH',
          actorUserId: validUserId,
        }),
      );
    });
  });

  describe('Troca de Senha (Segurança de Credenciais)', () => {
    it('deve rejeitar nova senha com menos de 8 caracteres', async () => {
      await expect(
        service.changePassword(validUserId, {
          currentPassword: 'SenhaAtual@123',
          newPassword: 'curta',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Tokens de Acesso JWT (createAccessToken)', () => {
    it('deve gerar JWT assinado com HMAC-SHA256 e payload de expiração', () => {
      const token = createAccessToken(
        { userId: validUserId, role: UserRole.PATIENT },
        testSecret,
      );

      const parts = token.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('HS256');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.userId).toBe(validUserId);
      expect(payload.role).toBe(UserRole.PATIENT);
      expect(payload.exp).toBeGreaterThan(Date.now());
    });
  });
});

