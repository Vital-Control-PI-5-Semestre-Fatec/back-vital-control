import { Injectable } from '@nestjs/common';
import { AuditLog, mapAuditLog } from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class AuditService {
  constructor(private readonly supabase: SupabaseService) {}

  async record(input: Partial<AuditLog>): Promise<AuditLog | null> {
    if (!input.actorUserId || !input.action || !input.resourceType) {
      return null;
    }

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
      return null;
    }

    return mapAuditLog(data);
  }
}
