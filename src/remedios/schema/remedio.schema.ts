import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'remedios', timestamps: true })
export class Remedio extends Document {
  @Prop({ required: true })
  emailPaciente!: string;

  @Prop({ required: true })
  nomeRemedio!: string;

  @Prop({ required: true })
  dosagem!: string;

  @Prop()
  estoqueAtual?: number;

  @Prop()
  codigoBarras?: string;

  @Prop()
  marca?: string;

  @Prop()
  imagemUrl?: string;

  @Prop()
  observacoes?: string;

  @Prop({
    enum: ['MANUAL', 'COSMOS', 'ANVISA', 'COSMOS_ANVISA'],
    default: 'MANUAL',
  })
  fonteCadastro?: string;

  @Prop({ default: true })
  ativo!: boolean;
}

export const RemedioSchema = SchemaFactory.createForClass(Remedio);
