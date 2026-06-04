import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsController } from './notifications.controller';

@Module({ imports: [DatabaseModule], controllers: [NotificationsController] })
export class NotificationsModule {}
