import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ficha } from './schema/ficha.schema';
import { CreateFichaDto } from './dto/create-ficha.dto';

@Injectable()
export class FichasService {
  constructor(@InjectModel(Ficha.name) private fichaModel: Model<Ficha>) {}

  async create(createFichaDto: CreateFichaDto): Promise<Ficha> {
    const newFicha = new this.fichaModel(createFichaDto);
    return newFicha.save();
  }

  async findByEmail(email: string): Promise<Ficha> {
    const ficha = await this.fichaModel.findOne({ emailPaciente: email }).exec();
    if (!ficha) {
      throw new NotFoundException(`Ficha do paciente ${email} não encontrada`);
    }
    return ficha;
  }

  async update(email: string, updateFichaDto: Partial<CreateFichaDto>): Promise<Ficha> {
    const updatedFicha = await this.fichaModel
      .findOneAndUpdate({ emailPaciente: email }, updateFichaDto, { new: true })
      .exec();
    if (!updatedFicha) {
      throw new NotFoundException(`Ficha não encontrada para atualização`);
    }
    return updatedFicha;
  }
}