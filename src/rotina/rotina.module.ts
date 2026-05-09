import { Module } from '@nestjs/common';
import { RotinaService } from './rotina.service';
import { RotinaController } from './rotina.controller';

@Module({
  controllers: [RotinaController],
  providers: [RotinaService],
})
export class RotinaModule {}
