import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Definindo o Enum para consistência no código
export enum LogType {
  PACIENTE_AUTONOMO = 'PACIENTE_AUTONOMO',
  CUIDADOR = 'CUIDADOR',
  RESPONSAVEL = 'RESPONSAVEL',
  GERENTE_CUIDADORES = 'GERENTE_CUIDADORES',
}

@Schema({ timestamps: false, collection: 'users' })
export class User extends Document {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop()
  passwordHash!: string;

  @Prop({ required: true, enum: LogType })
  logType!: string;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);