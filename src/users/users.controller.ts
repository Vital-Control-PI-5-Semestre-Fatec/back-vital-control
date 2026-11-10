import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, UserRole } from '../common/auth';
import { UsersService } from './users.service';

class EligibleUsersQueryDto {
  @IsIn([UserRole.PATIENT, UserRole.CAREGIVER, UserRole.RESPONSIBLE])
  role: UserRole;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('eligible')
  eligible(@Query() query: EligibleUsersQueryDto) {
    return this.usersService.eligible(query.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, body, user);
  }
}
