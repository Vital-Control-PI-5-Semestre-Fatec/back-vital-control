import { UserRole } from '../common/auth';

export interface User {
  _id: string;
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientProfile {
  _id: string;
  id: string;
  patientId: string;
  bloodType?: string;
  weightKg?: number;
  heightCm?: number;
  allergies: string[];
  preExistingConditions: string[];
  defaultAddress?: Record<string, string>;
  emergencyContacts?: { name: string; phone: string }[];
  timezone: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Medication {
  _id: string;
  id: string;
  patientId: string;
  name: string;
  dosageDescription: string;
  barcode?: string;
  brand?: string;
  imageUrl?: string;
  notes?: string;
  registrationSource: string;
  stock: {
    currentQuantity: number;
    unit: string;
    lowStockThreshold?: number;
  };
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockMovement {
  _id: string;
  id: string;
  patientId: string;
  medicationId: string;
  type: string;
  direction: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  administrationId?: string;
  reason?: string;
  performedByUserId: string;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicationSchedule {
  _id: string;
  id: string;
  patientId: string;
  medicationId: string;
  title: string;
  dose: {
    quantity: number;
    unit: string;
  };
  times: string[];
  recurrence: Record<string, unknown>;
  startDate: string;
  endDate?: string;
  timezone: string;
  instructions?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicationAdministration {
  _id: string;
  id: string;
  patientId: string;
  scheduleId: string;
  medicationId: string;
  scheduledFor: string;
  status: string;
  completedAt?: string;
  performedByUserId?: string;
  justification?: string;
  notes?: string;
  medicationSnapshot: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CareGroup {
  _id: string;
  id: string;
  name: string;
  patientIds: string[];
  patientInitialsMap?: Record<string, string>;
  managerId: string;
  caregiverIds: string[];
  responsibleIds: string[];
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HomeVisit {
  _id: string;
  id: string;
  patientId: string;
  patientInitials?: string;
  careGroupId?: string;
  managerId?: string;
  assignedCaregiverId?: string;
  reason: string;
  patientNotes?: string;
  caregiverNotes?: string;
  requestedWindow: {
    start: string;
    end: string;
  };
  scheduledWindow?: { start: string; end: string };
  addressSnapshot: Record<string, string>;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

const IGNORED_NAME_PARTICLES = new Set(['da', 'de', 'di', 'do', 'das', 'dos', 'e']);

export function formatNameInitials(fullName?: string): string {
  if (!fullName || !fullName.trim()) return 'S/P';
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0 && !IGNORED_NAME_PARTICLES.has(part.toLowerCase()));
  if (parts.length === 0) return 'P.';
  return `${parts.map((part) => part[0].toUpperCase()).join('.')}.`;
}

export interface HomeVisitEvent {
  _id: string;
  id: string;
  homeVisitId: string;
  type: string;
  performedByUserId: string;
  occurredAt: string;
  details: Record<string, unknown>;
}

export interface NotificationDevice {
  _id: string;
  id: string;
  userId: string;
  pushToken: string;
  platform: string;
  deviceName?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  _id?: string;
  id?: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UserConsent {
  _id?: string;
  id?: string;
  userId: string;
  purpose: string;
  consented: boolean;
  version: string;
  consentedAt: string;
  revokedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LgpdDataRequest {
  _id?: string;
  id?: string;
  userId: string;
  requestType: 'ACCESS_EXPORT' | 'CORRECTION' | 'DELETION';
  details?: string;
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED' | 'REJECTED';
  responseNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Mappers entre linhas snake_case do PostgreSQL/Supabase e objetos camelCase do contrato da API

export function mapUser(row: Record<string, any>): User {
  return {
    _id: String(row.id),
    id: String(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    status: row.status ?? 'ACTIVE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPatientProfile(row: Record<string, any>): PatientProfile {
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    bloodType: row.blood_type ?? undefined,
    weightKg: row.weight_kg !== null && row.weight_kg !== undefined ? Number(row.weight_kg) : undefined,
    heightCm: row.height_cm !== null && row.height_cm !== undefined ? Number(row.height_cm) : undefined,
    allergies: row.allergies ?? [],
    preExistingConditions: row.pre_existing_conditions ?? [],
    defaultAddress: row.default_address ?? undefined,
    emergencyContacts: row.emergency_contacts ?? [],
    timezone: row.timezone ?? 'America/Sao_Paulo',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMedication(row: Record<string, any>): Medication {
  const stock = row.stock ?? {};
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    name: row.name,
    dosageDescription: row.dosage_description,
    barcode: row.barcode ?? undefined,
    brand: row.brand ?? undefined,
    imageUrl: row.image_url ?? undefined,
    notes: row.notes ?? undefined,
    registrationSource: row.registration_source ?? 'MANUAL',
    stock: {
      currentQuantity: Number(stock.currentQuantity ?? 0),
      unit: String(stock.unit ?? ''),
      ...(stock.lowStockThreshold !== undefined
        ? { lowStockThreshold: Number(stock.lowStockThreshold) }
        : {}),
    },
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStockMovement(row: Record<string, any>): StockMovement {
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    medicationId: String(row.medication_id),
    type: row.type,
    direction: row.direction,
    quantity: Number(row.quantity),
    stockBefore: Number(row.stock_before),
    stockAfter: Number(row.stock_after),
    administrationId: row.administration_id ? String(row.administration_id) : undefined,
    reason: row.reason ?? undefined,
    performedByUserId: String(row.performed_by_user_id),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMedicationSchedule(row: Record<string, any>): MedicationSchedule {
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    medicationId: String(row.medication_id),
    title: row.title,
    dose: row.dose,
    times: row.times ?? [],
    recurrence: row.recurrence ?? {},
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    timezone: row.timezone ?? 'America/Sao_Paulo',
    instructions: row.instructions ?? undefined,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMedicationAdministration(
  row: Record<string, any>,
): MedicationAdministration {
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    scheduleId: String(row.schedule_id),
    medicationId: String(row.medication_id),
    scheduledFor: row.scheduled_for,
    status: row.status,
    completedAt: row.completed_at ?? undefined,
    performedByUserId: row.performed_by_user_id ? String(row.performed_by_user_id) : undefined,
    justification: row.justification ?? undefined,
    notes: row.notes ?? undefined,
    medicationSnapshot: row.medication_snapshot ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCareGroup(row: Record<string, any>): CareGroup {
  return {
    _id: String(row.id),
    id: String(row.id),
    name: row.name,
    patientIds: (row.patient_ids ?? []).map(String),
    managerId: String(row.manager_id),
    caregiverIds: (row.caregiver_ids ?? []).map(String),
    responsibleIds: (row.responsible_ids ?? []).map(String),
    status: row.status ?? 'ACTIVE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapHomeVisit(row: Record<string, any>): HomeVisit {
  return {
    _id: String(row.id),
    id: String(row.id),
    patientId: String(row.patient_id),
    careGroupId: row.care_group_id ? String(row.care_group_id) : undefined,
    managerId: row.manager_id ? String(row.manager_id) : undefined,
    assignedCaregiverId: row.assigned_caregiver_id
      ? String(row.assigned_caregiver_id)
      : undefined,
    reason: row.reason,
    patientNotes: row.patient_notes ?? undefined,
    caregiverNotes: row.caregiver_notes ?? undefined,
    requestedWindow: row.requested_window,
    scheduledWindow: row.scheduled_window ?? undefined,
    addressSnapshot: row.address_snapshot ?? {},
    status: row.status ?? 'REQUESTED',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapHomeVisitEvent(row: Record<string, any>): HomeVisitEvent {
  return {
    _id: String(row.id),
    id: String(row.id),
    homeVisitId: String(row.home_visit_id),
    type: row.type,
    performedByUserId: String(row.performed_by_user_id),
    occurredAt: row.occurred_at,
    details: row.details ?? {},
  };
}

export function mapNotificationDevice(row: Record<string, any>): NotificationDevice {
  return {
    _id: String(row.id),
    id: String(row.id),
    userId: String(row.user_id),
    pushToken: row.push_token,
    platform: row.platform,
    deviceName: row.device_name ?? undefined,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAuditLog(row: Record<string, any>): AuditLog {
  return {
    _id: String(row.id),
    id: String(row.id),
    actorUserId: String(row.actor_user_id),
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id ? String(row.resource_id) : undefined,
    patientId: row.patient_id ? String(row.patient_id) : undefined,
    occurredAt: row.occurred_at,
    metadata: row.metadata ?? undefined,
  };
}

export function mapUserConsent(row: Record<string, any>): UserConsent {
  return {
    _id: String(row.id),
    id: String(row.id),
    userId: String(row.user_id),
    purpose: row.purpose,
    consented: Boolean(row.consented),
    version: row.version ?? '1.0',
    consentedAt: row.consented_at ?? row.created_at,
    revokedAt: row.revoked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLgpdDataRequest(row: Record<string, any>): LgpdDataRequest {
  return {
    _id: String(row.id),
    id: String(row.id),
    userId: String(row.user_id),
    requestType: row.request_type,
    details: row.details ?? undefined,
    status: row.status ?? 'PENDING',
    responseNotes: row.response_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
