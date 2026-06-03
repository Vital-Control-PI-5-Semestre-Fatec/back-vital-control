import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CareGroupsController } from './care-groups.controller';

@Module({ imports: [DatabaseModule], controllers: [CareGroupsController] })
export class CareGroupsModule {}
