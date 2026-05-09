import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RemediosService } from './remedios.service';
import { CreateRemedioDto } from './dto/create-remedio.dto';
import { UpdateRemedioDto } from './dto/update-remedio.dto';

@Controller('remedios')
export class RemediosController {
  constructor(private readonly remediosService: RemediosService) {}

  @Post()
  create(@Body() createRemedioDto: CreateRemedioDto) {
    return this.remediosService.create(createRemedioDto);
  }

  @Get()
  findAll() {
    return this.remediosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.remediosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRemedioDto: UpdateRemedioDto) {
    return this.remediosService.update(id, updateRemedioDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.remediosService.remove(id);
  }
}