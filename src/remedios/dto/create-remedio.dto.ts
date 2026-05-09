import { IsString, IsEmail, IsNumber, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateRemedioDto {
  @IsEmail()
  emailPaciente!: string;

  @IsString()
  @IsNotEmpty()
  nomeRemedio!: string;

  @IsString()
  @IsNotEmpty()
  dosagem!: string;

  @IsNumber()
  @IsOptional()
  estoqueAtual?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}