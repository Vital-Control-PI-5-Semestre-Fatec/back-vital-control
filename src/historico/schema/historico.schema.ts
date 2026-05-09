import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum StatusExecucao {
  CONCLUIDO = 'Concluído',
  ATRASADO = 'Concluído Atrasado',
  NAO_REALIZADO = 'Não Realizado',
}

@Schema({ 
  collection: 'historico',
  timeseries: {
    timeField: 'dataExecucao',
    metaField: 'emailPaciente',
    granularity: 'hours'
  }
})
export class Historico extends Document {
  @Prop({ required: true })
  dataExecucao!: Date;

  @Prop({ required: true })
  emailPaciente!: string;

  @Prop()
  nomePaciente?: string;

  @Prop({ required: true })
  nomeRotina!: string;

  @Prop({ required: true, enum: StatusExecucao })
  status!: StatusExecucao;

  @Prop()
  emailCuidador?: string;
}

export const HistoricoSchema = SchemaFactory.createForClass(Historico);