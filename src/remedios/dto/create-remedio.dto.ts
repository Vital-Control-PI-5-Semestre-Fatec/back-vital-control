import {
  IsString,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  codigoBarras?: string;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  imagemUrl?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsIn(['MANUAL', 'COSMOS', 'ANVISA', 'COSMOS_ANVISA'])
  @IsOptional()
  fonteCadastro?: 'MANUAL' | 'COSMOS' | 'ANVISA' | 'COSMOS_ANVISA';

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
