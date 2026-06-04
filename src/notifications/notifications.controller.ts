import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Model } from 'mongoose';
import { AuthUser, CurrentUser } from '../common/auth';
import { NotificationDevice } from '../database/schemas';

class DeviceDto {
  @IsString() pushToken: string;
  @IsEnum(['ANDROID', 'IOS', 'WEB']) platform: string;
  @IsOptional() @IsString() deviceName?: string;
}

@Controller('notification-devices')
export class NotificationsController {
  constructor(@InjectModel(NotificationDevice.name) private readonly devices: Model<NotificationDevice>) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.devices.find({ userId: user.userId, active: true }); }
  @Post() register(@Body() body: DeviceDto, @CurrentUser() user: AuthUser) { return this.devices.findOneAndUpdate({ pushToken: body.pushToken }, { ...body, userId: user.userId, active: true }, { upsert: true, new: true }); }
  @Delete(':pushToken') disable(@Param('pushToken') pushToken: string, @CurrentUser() user: AuthUser) { return this.devices.findOneAndUpdate({ pushToken, userId: user.userId }, { active: false }, { new: true }); }
}
