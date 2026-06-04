import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, UserRole } from '../common/auth';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(UserRole) role: UserRole;
}
class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('register') register(@Body() body: RegisterDto) { return this.auth.register(body); }
  @Public() @Post('login') login(@Body() body: LoginDto) { return this.auth.login(body); }
  @Get('me') me(@CurrentUser() user: AuthUser) { return user; }
  @Patch('change-password') changePassword(@Body() body: ChangePasswordDto, @CurrentUser() user: AuthUser) {
    return this.auth.changePassword(user.userId, body);
  }
}
