import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, mapAuditLog } from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Registra log de ação crítica (RF08 - quem, o quê, quando).
   * Operação estritamente append-only (RF09 - imutabilidade).
   */
  async record(input: Partial<AuditLog>): Promise<AuditLog | null> {
    if (!input.actorUserId || !input.action || !input.resourceType) {
      return null;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('audit_logs')
        .insert({
          actor_user_id: input.actorUserId,
          action: input.action,
          resource_type: input.resourceType,
          resource_id: input.resourceId ?? null,
          patient_id: input.patientId ?? null,
          metadata: input.metadata ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        this.logger.warn(`Falha ao gravar audit_log: ${error?.message}`);
        return null;
      }

      return mapAuditLog(data);
    } catch (err) {
      this.logger.error('Exceção ao gravar audit_log:', err);
      return null;
    }
  }

  /**
   * Consulta a trilha de auditoria para perfis autorizados (RF10 - Gestor / Auditor).
   */
  async list(filters?: {
    actorUserId?: string;
    patientId?: string;
    resourceType?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    let query = this.supabase.client
      .from('audit_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(filters?.limit ?? 100);

    if (filters?.actorUserId) {
      query = query.eq('actor_user_id', filters.actorUserId);
    }
    if (filters?.patientId) {
      query = query.eq('patient_id', filters.patientId);
    }
    if (filters?.resourceType) {
      query = query.eq('resource_type', filters.resourceType);
    }

    const { data, error } = await query;
    if (error || !data) {
      return [];
    }

    return data.map(mapAuditLog);
  }
}
