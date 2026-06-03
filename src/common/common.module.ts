import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AccessService } from './access.service';

@Global()
@Module({ imports: [DatabaseModule], providers: [AccessService], exports: [AccessService] })
export class CommonModule {}
