import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { LogType } from '../schema/user.schema';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres' })
    password!: string;

    @IsEnum(LogType, { message: 'logType deve ser um dos valores permitidos' })
    @IsNotEmpty()
    logType!: LogType;
}