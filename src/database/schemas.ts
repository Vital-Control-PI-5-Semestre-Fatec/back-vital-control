import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../common/auth';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ required: true, enum: UserRole }) role: UserRole;
  @Prop({ enum: ['ACTIVE', 'SUSPENDED', 'INACTIVE'], default: 'ACTIVE' }) status: string;
}
export const UserSchema = SchemaFactory.createForClass(User);

@Schema({ collection: 'patient_profiles', timestamps: true })
export class PatientProfile {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, unique: true }) patientId: Types.ObjectId;
  @Prop() bloodType?: string;
  @Prop({ min: 0 }) weightKg?: number;
  @Prop({ min: 0 }) heightCm?: number;
  @Prop({ type: [String], default: [] }) allergies: string[];
  @Prop({ type: [String], default: [] }) preExistingConditions: string[];
  @Prop({ type: Object }) defaultAddress?: Record<string, string>;
  @Prop({ type: [{ name: String, phone: String }], default: [] }) emergencyContacts?: { name: string; phone: string }[];
  @Prop({ default: 'America/Sao_Paulo' }) timezone: string;
}
export const PatientProfileSchema = SchemaFactory.createForClass(PatientProfile);

@Schema({ collection: 'medications', timestamps: true })
export class Medication {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) patientId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) dosageDescription: string;
  @Prop() barcode?: string;
  @Prop() brand?: string;
  @Prop() imageUrl?: string;
  @Prop() notes?: string;
  @Prop({ enum: ['MANUAL', 'COSMOS', 'ANVISA', 'COSMOS_ANVISA'], default: 'MANUAL' }) registrationSource: string;
  @Prop({ type: Object, required: true }) stock: { currentQuantity: number; unit: string; lowStockThreshold?: number };
  @Prop({ default: true }) active: boolean;
}
export const MedicationSchema = SchemaFactory.createForClass(Medication);
MedicationSchema.index({ patientId: 1, active: 1 });
MedicationSchema.index({ patientId: 1, barcode: 1 });

@Schema({ collection: 'stock_movements', timestamps: true })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true }) patientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: Medication.name, required: true, index: true }) medicationId: Types.ObjectId;
  @Prop({ required: true }) type: string;
  @Prop({ enum: ['IN', 'OUT'], required: true }) direction: string;
  @Prop({ required: true, min: 0 }) quantity: number;
  @Prop({ required: true }) stockBefore: number;
  @Prop({ required: true }) stockAfter: number;
  @Prop({ type: Types.ObjectId }) administrationId?: Types.ObjectId;
  @Prop() reason?: string;
  @Prop({ type: Types.ObjectId, ref: User.name, required: true }) performedByUserId: Types.ObjectId;
  @Prop({ default: Date.now }) occurredAt: Date;
}
export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ medicationId: 1, occurredAt: -1 });
StockMovementSchema.index({ administrationId: 1 }, { unique: true, sparse: true });

@Schema({ collection: 'medication_schedules', timestamps: true })
export class MedicationSchedule {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) patientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: Medication.name, required: true }) medicationId: Types.ObjectId;
  @Prop({ required: true }) title: string;
  @Prop({ type: Object, required: true }) dose: { quantity: number; unit: string };
  @Prop({ type: [String], required: true }) times: string[];
  @Prop({ type: Object, required: true }) recurrence: Record<string, unknown>;
  @Prop({ required: true }) startDate: Date;
  @Prop() endDate?: Date;
  @Prop({ default: 'America/Sao_Paulo' }) timezone: string;
  @Prop() instructions?: string;
  @Prop({ default: true }) active: boolean;
}
export const MedicationScheduleSchema = SchemaFactory.createForClass(MedicationSchedule);

@Schema({ collection: 'medication_administrations', timestamps: true })
export class MedicationAdministration {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) patientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: MedicationSchedule.name, required: true }) scheduleId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: Medication.name, required: true }) medicationId: Types.ObjectId;
  @Prop({ required: true }) scheduledFor: Date;
  @Prop({ enum: ['PENDING', 'TAKEN_ON_TIME', 'TAKEN_LATE', 'MISSED', 'SKIPPED'], default: 'PENDING' }) status: string;
  @Prop() completedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: User.name }) performedByUserId?: Types.ObjectId;
  @Prop() justification?: string;
  @Prop() notes?: string;
  @Prop({ type: Object, required: true }) medicationSnapshot: Record<string, unknown>;
}
export const MedicationAdministrationSchema = SchemaFactory.createForClass(MedicationAdministration);
MedicationAdministrationSchema.index({ scheduleId: 1, scheduledFor: 1 }, { unique: true });

@Schema({ collection: 'care_groups', timestamps: true })
export class CareGroup {
  @Prop({ required: true }) name: string;
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) patientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) managerId: Types.ObjectId;
  @Prop({ type: [Types.ObjectId], default: [] }) caregiverIds: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], default: [] }) responsibleIds: Types.ObjectId[];
  @Prop({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }) status: string;
}
export const CareGroupSchema = SchemaFactory.createForClass(CareGroup);

@Schema({ collection: 'home_visits', timestamps: true })
export class HomeVisit {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) patientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: CareGroup.name }) careGroupId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: User.name }) managerId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: User.name, index: true }) assignedCaregiverId?: Types.ObjectId;
  @Prop({ required: true }) reason: string;
  @Prop() patientNotes?: string;
  @Prop() caregiverNotes?: string;
  @Prop({ type: Object, required: true }) requestedWindow: { start: Date; end: Date };
  @Prop({ type: Object }) scheduledWindow?: { start: Date; end: Date };
  @Prop({ type: Object, required: true }) addressSnapshot: Record<string, string>;
  @Prop({ default: 'REQUESTED' }) status: string;
}
export const HomeVisitSchema = SchemaFactory.createForClass(HomeVisit);

@Schema({ collection: 'home_visit_events', timestamps: false })
export class HomeVisitEvent {
  @Prop({ type: Types.ObjectId, ref: HomeVisit.name, required: true, index: true }) homeVisitId: Types.ObjectId;
  @Prop({ required: true }) type: string;
  @Prop({ type: Types.ObjectId, ref: User.name, required: true }) performedByUserId: Types.ObjectId;
  @Prop({ default: Date.now }) occurredAt: Date;
  @Prop({ type: Object, default: {} }) details: Record<string, unknown>;
}
export const HomeVisitEventSchema = SchemaFactory.createForClass(HomeVisitEvent);

@Schema({ collection: 'notification_devices', timestamps: true })
export class NotificationDevice {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, unique: true }) pushToken: string;
  @Prop({ enum: ['ANDROID', 'IOS', 'WEB'], required: true }) platform: string;
  @Prop() deviceName?: string;
  @Prop({ default: true }) active: boolean;
}
export const NotificationDeviceSchema = SchemaFactory.createForClass(NotificationDevice);

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true }) actorUserId: Types.ObjectId;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) resourceType: string;
  @Prop({ type: Types.ObjectId }) resourceId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) patientId?: Types.ObjectId;
  @Prop({ default: Date.now }) occurredAt: Date;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);