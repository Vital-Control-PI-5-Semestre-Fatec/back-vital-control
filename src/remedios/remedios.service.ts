import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Remedio } from './schema/remedio.schema';
import { CreateRemedioDto } from './dto/create-remedio.dto';
import { UpdateRemedioDto } from './dto/update-remedio.dto';

@Injectable()
export class RemediosService {
  constructor(@InjectModel(Remedio.name) private remedioModel: Model<Remedio>) {}

  async create(createRemedioDto: CreateRemedioDto): Promise<Remedio> {
    const createdRemedio = new this.remedioModel(createRemedioDto);
    return createdRemedio.save();
  }

  async findAll(): Promise<Remedio[]> {
    return this.remedioModel.find().exec();
  }

  async findOne(id: string): Promise<Remedio> {
    const remedio = await this.remedioModel.findById(id).exec();
    if (!remedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }
    return remedio;
  }

  async update(id: string, updateRemedioDto: UpdateRemedioDto): Promise<Remedio> {
    const existingRemedio = await this.remedioModel
      .findByIdAndUpdate(id, updateRemedioDto, { new: true }) // new: true devolve o objeto atualizado
      .exec();
      
    if (!existingRemedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }
    return existingRemedio;
  }

  async remove(id: string): Promise<Remedio> {
    const deletedRemedio = await this.remedioModel.findByIdAndDelete(id).exec();
    if (!deletedRemedio) {
      throw new NotFoundException(`Remédio com ID ${id} não encontrado`);
    }
    return deletedRemedio;
  }
}