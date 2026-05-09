import { PartialType } from '@nestjs/mapped-types';
import { CreateRemedioDto } from './create-remedio.dto';

export class UpdateRemedioDto extends PartialType(CreateRemedioDto) {}