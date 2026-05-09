import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum Periodo {
  MANHA = 'Manhã',
  TARDE = 'Tarde',
  NOITE = 'Noite',
}

@Schema()
class DetalhesMedicamento {
  @Prop({ required: true })
  nome!: string;

  @Prop({ required: true })
  dosagem!: string;
}

@Schema({ collection: 'rotinas' })
export class Rotina extends Document {
  @Prop({ required: true })
  emailPaciente!: string;

  @Prop()
  emailCuidador?: string;

  @Prop({ required: true })
  titulo!: string;

  @Prop({ required: true, enum: Periodo })
  periodo!: Periodo;

  @Prop({ required: true })
  horario!: string;

  @Prop({ type: [String] })
  frequenciaDias!: string[];

  @Prop({ type: DetalhesMedicamento, required: true })
  detalhesMedicamento!: DetalhesMedicamento;
}

export const RotinaSchema = SchemaFactory.createForClass(Rotina);