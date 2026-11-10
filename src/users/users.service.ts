import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, UserRole } from '../common/auth';
import { mapUser } from '../database/schemas';
import { isValidUuid, SupabaseService } from '../database/supabase.service';

export interface UpdateUserInput {
  name?: string;
  email?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  async eligible(role: UserRole) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, name, email, role')
      .eq('role', role)
      .eq('status', 'ACTIVE')
      .order('name', { ascending: true })
      .order('email', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((user) => ({
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  }

  async update(id: string, input: UpdateUserInput, currentUser: AuthUser) {
    if (!isValidUuid(id)) {
      throw new BadRequestException('Identificador de usuário inválido');
    }

    if (currentUser.userId !== id) {
      throw new ForbiddenException('Somente o próprio usuário pode atualizar seus dados');
    }

    const updatePayload: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('O nome não pode ser vazio');
      }
      updatePayload.name = trimmedName;
    }

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (!normalizedEmail) {
        throw new BadRequestException('O e-mail não pode ser vazio');
      }

      const { data: existingEmail } = await this.supabase.client
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .neq('id', id)
        .maybeSingle();

      if (existingEmail) {
        throw new ConflictException('E-mail já cadastrado');
      }

      updatePayload.email = normalizedEmail;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Nenhum campo válido informado para atualização');
    }

    const { data: existingUser } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const { data, error } = await this.supabase.client
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .select()
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw new BadRequestException(error?.message ?? 'Erro ao atualizar usuário');
    }

    const mapped = mapUser(data);
    return {
      _id: mapped._id,
      id: mapped.id,
      name: mapped.name,
      email: mapped.email,
      role: mapped.role,
      status: mapped.status,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
    };
  }
}
