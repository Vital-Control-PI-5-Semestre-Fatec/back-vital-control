import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { FichasService } from './fichas.service';
import { CreateFichaDto } from './dto/create-ficha.dto';

@Controller('fichas')
export class FichasController {
  constructor(private readonly fichasService: FichasService) {}

  @Post()
  create(@Body() createFichaDto: CreateFichaDto) {
    return this.fichasService.create(createFichaDto);
  }

  @Get(':email')
  findOne(@Param('email') email: string) {
    return this.fichasService.findByEmail(email);
  }

  @Put(':email')
  update(@Param('email') email: string, @Body() updateFichaDto: Partial<CreateFichaDto>) {
    return this.fichasService.update(email, updateFichaDto);
  }
}