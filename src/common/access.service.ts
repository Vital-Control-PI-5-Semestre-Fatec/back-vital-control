import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser, UserRole } from './auth';
import { isValidUuid, SupabaseService } from '../database/supabase.service';

@Injectable()
export class AccessService {
  constructor(private readonly supabase: SupabaseService) {}

  async assertPatientReadAccess(user: AuthUser, patientId: string): Promise<void> {
    if (user.role === UserRole.PATIENT && user.userId === patientId) return;

    const cleanPatientId = this.objectId(patientId);
    const cleanUserId = this.objectId(user.userId);

    let query = this.supabase.client
      .from('care_groups')
      .select('id', { count: 'exact', head: true })
      .contains('patient_ids', [cleanPatientId])
      .eq('status', 'ACTIVE');

    if (user.role === UserRole.CAREGIVER) {
      query = query.contains('caregiver_ids', [cleanUserId]);
    } else if (user.role === UserRole.CARE_MANAGER) {
      query = query.eq('manager_id', cleanUserId);
    } else if (user.role === UserRole.RESPONSIBLE) {
      query = query.contains('responsible_ids', [cleanUserId]);
    } else {
      throw new ForbiddenException('Sem acesso ao paciente');
    }

    const { count, error } = await query;
    if (error || !count || count < 1) {
      throw new ForbiddenException('Sem acesso ao paciente');
    }
  }

  assertPatientWriteAccess(user: AuthUser, patientId: string): void {
    if (user.role !== UserRole.PATIENT || user.userId !== patientId) {
      throw new ForbiddenException('Somente o paciente pode alterar este recurso');
    }
  }

  objectId(value: string): string {
    if (!isValidUuid(value)) throw new ForbiddenException('Identificador inválido');
    return value.trim();
  }
}
