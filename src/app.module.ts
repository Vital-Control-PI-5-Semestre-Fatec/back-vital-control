import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CareGroupsModule } from './care-groups/care-groups.module';
import { AuthGuard } from './common/auth';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { HomeVisitsModule } from './home-visits/home-visits.module';
import { MedicationsModule } from './medications/medications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulesModule } from './schedules/schedules.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
    AuditModule,
    AuthModule,
    PatientsModule,
    MedicationsModule,
    SchedulesModule,
    CareGroupsModule,
    HomeVisitsModule,
    NotificationsModule,
    UsersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
