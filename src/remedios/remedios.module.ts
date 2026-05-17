import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RemediosService } from './remedios.service';
import { RemediosController } from './remedios.controller';
import { Remedio, RemedioSchema } from './schema/remedio.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Remedio.name,
        schema: RemedioSchema,
      },
    ]),
  ],
  controllers: [RemediosController],
  providers: [RemediosService],
})
export class RemediosModule {}
