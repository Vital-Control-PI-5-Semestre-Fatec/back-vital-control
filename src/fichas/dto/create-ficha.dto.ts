import { IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateFichaDto {

    @IsEmail()
    emailPaciente!: string;

    @IsString()
    @IsOptional()
    tipoSanguineo?: string;

    @IsNumber()
    @IsOptional()
    peso?: number;

    @IsNumber()
    @IsOptional()
    altura?: number;

    @IsArray()
    @IsString({ each: true })
    alergias!: string[];

    @IsArray()
    @IsString({ each: true })
    condicoesPreExistentes!: string[];
}
