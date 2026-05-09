import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'remedios' })
export class Remedio extends Document {
  @Prop({ required: true })
  emailPaciente!: string;

  @Prop({ required: true })
  nomeRemedio!: string;

  @Prop({ required: true })
  dosagem!: string;

  @Prop()
  estoqueAtual?: number;

  @Prop({ default: true })
  ativo!: boolean;
}

export const RemedioSchema = SchemaFactory.createForClass(Remedio);