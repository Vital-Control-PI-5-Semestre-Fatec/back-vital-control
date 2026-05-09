import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'fichas' })
export class Ficha extends Document {
  @Prop({ required: true, unique: true })
  emailPaciente!: string;

  @Prop()
  tipoSanguineo?: string;

  @Prop()
  peso?: number;

  @Prop()
  altura?: number;

  @Prop({ type: [String] })
  alergias!: string[];

  @Prop({ type: [String] })
  condicoesPreExistentes!: string[];
}

export const FichaSchema = SchemaFactory.createForClass(Ficha);