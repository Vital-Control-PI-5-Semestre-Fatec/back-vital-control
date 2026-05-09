import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RotinaService } from './rotina.service';
import { CreateRotinaDto } from './dto/create-rotina.dto';
import { UpdateRotinaDto } from './dto/update-rotina.dto';

@Controller('rotina')
export class RotinaController {
  constructor(private readonly rotinaService: RotinaService) {}

  @Post()
  create(@Body() createRotinaDto: CreateRotinaDto) {
    return this.rotinaService.create(createRotinaDto);
  }

  @Get()
  findAll() {
    return this.rotinaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rotinaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRotinaDto: UpdateRotinaDto) {
    return this.rotinaService.update(+id, updateRotinaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rotinaService.remove(+id);
  }
}
