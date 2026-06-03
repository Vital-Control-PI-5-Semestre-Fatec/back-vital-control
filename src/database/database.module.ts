import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AuditLog,
  AuditLogSchema,
  CareGroup,
  CareGroupSchema,
  HomeVisit,
  HomeVisitEvent,
  HomeVisitEventSchema,
  HomeVisitSchema,
  Medication,
  MedicationAdministration,
  MedicationAdministrationSchema,
  MedicationSchedule,
  MedicationScheduleSchema,
  MedicationSchema,
  NotificationDevice,
  NotificationDeviceSchema,
  PatientProfile,
  PatientProfileSchema,
  StockMovement,
  StockMovementSchema,
  User,
  UserSchema,
} from './schemas';

const models = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: PatientProfile.name, schema: PatientProfileSchema },
  { name: Medication.name, schema: MedicationSchema },
  { name: StockMovement.name, schema: StockMovementSchema },
  { name: MedicationSchedule.name, schema: MedicationScheduleSchema },
  { name: MedicationAdministration.name, schema: MedicationAdministrationSchema },
  { name: CareGroup.name, schema: CareGroupSchema },
  { name: HomeVisit.name, schema: HomeVisitSchema },
  { name: HomeVisitEvent.name, schema: HomeVisitEventSchema },
  { name: NotificationDevice.name, schema: NotificationDeviceSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
]);

@Module({ imports: [models], exports: [models] })
export class DatabaseModule {}
