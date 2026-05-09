import { Injectable } from '@nestjs/common';
import { CreateRotinaDto } from './dto/create-rotina.dto';
import { UpdateRotinaDto } from './dto/update-rotina.dto';

@Injectable()
export class RotinaService {
  create(createRotinaDto: CreateRotinaDto) {
    return 'This action adds a new rotina';
  }

  findAll() {
    return `This action returns all rotina`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rotina`;
  }

  update(id: number, updateRotinaDto: UpdateRotinaDto) {
    return `This action updates a #${id} rotina`;
  }

  remove(id: number) {
    return `This action removes a #${id} rotina`;
  }
}
