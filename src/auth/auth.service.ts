import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createAccessToken, UserRole } from '../common/auth';
import { mapUser, User } from '../database/schemas';
import { isValidUuid, SupabaseService } from '../database/supabase.service';

const activeUserFilter = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] };

const derive = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 120000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = await derive(password, salt, 120000, 32, 'sha256');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async register(input: { name: string; email: string; password: string; role: UserRole }) {
    const email = input.email.trim().toLowerCase();

    const { data: existing } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await hashPassword(input.password);
    const { data, error } = await this.supabase.client
      .from('users')
      .insert({
        name: input.name.trim(),
        email,
        password_hash: passwordHash,
        role: input.role,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw new BadRequestException(error?.message ?? 'Erro ao cadastrar usuário');
    }

    return this.response(mapUser(data));
  }

  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const { data } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!data) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const user = mapUser(data);
    if (!(await passwordMatches(input.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    return this.response(user);
  }

  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    if (!input.newPassword || input.newPassword.length < 8) {
      throw new BadRequestException('A nova senha deve ter no minimo 8 caracteres');
    }
    if (!isValidUuid(userId)) {
      throw new UnauthorizedException('Sessao invalida');
    }

    const { data } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!data) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const user = mapUser(data);
    if (!(await passwordMatches(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const newPasswordHash = await hashPassword(input.newPassword);
    const { error } = await this.supabase.client
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', userId);

    if (error) {
      throw new BadRequestException('Não foi possível alterar a senha');
    }

    return { success: true, message: 'Senha alterada com sucesso' };
  }

  private response(user: User) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado');
    return {
      accessToken: createAccessToken({ userId: String(user.id), role: user.role }, secret),
      user: { id: String(user.id), name: user.name, email: user.email, role: user.role },
    };
  }
}
