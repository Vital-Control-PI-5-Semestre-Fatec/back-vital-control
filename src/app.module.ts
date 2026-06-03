import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CareGroupsModule } from './care-groups/care-groups.module';
import { AuthGuard } from './common/auth';
import { CommonModule } from './common/common.module';
import { HomeVisitsModule } from './home-visits/home-visits.module';
import { MedicationsModule } from './medications/medications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulesModule } from './schedules/schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('DATABASE_URL');
        if (!uri) throw new Error('DATABASE_URL não configurado');
        return { uri };
      },
    }),
    CommonModule,
    AuditModule,
    AuthModule,
    PatientsModule,
    MedicationsModule,
    SchedulesModule,
    CareGroupsModule,
    HomeVisitsModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
