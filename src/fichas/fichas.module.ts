import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';
import { Ficha, FichaSchema } from './schema/ficha.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ficha.name, schema: FichaSchema }])
  ],
  controllers: [FichasController],
  providers: [FichasService],
})
export class FichasModule {}