import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { mapNotificationDevice } from '../database/schemas';
import { SupabaseService } from '../database/supabase.service';

class DeviceDto {
  @IsString() pushToken: string;
  @IsEnum(['ANDROID', 'IOS', 'WEB']) platform: string;
  @IsOptional() @IsString() deviceName?: string;
}

@Controller('notification-devices')
export class NotificationsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const { data } = await this.supabase.client
      .from('notification_devices')
      .select('*')
      .eq('user_id', user.userId)
      .eq('active', true);

    return (data ?? []).map(mapNotificationDevice);
  }

  @Post()
  async register(@Body() body: DeviceDto, @CurrentUser() user: AuthUser) {
    const { data, error } = await this.supabase.client
      .from('notification_devices')
      .upsert(
        {
          push_token: body.pushToken,
          platform: body.platform,
          device_name: body.deviceName ?? null,
          user_id: user.userId,
          active: true,
        },
        { onConflict: 'push_token' },
      )
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Erro ao registrar dispositivo');
    }

    return mapNotificationDevice(data);
  }

  @Delete(':pushToken')
  async disable(@Param('pushToken') pushToken: string, @CurrentUser() user: AuthUser) {
    const { data } = await this.supabase.client
      .from('notification_devices')
      .update({ active: false })
      .eq('push_token', pushToken)
      .eq('user_id', user.userId)
      .select()
      .maybeSingle();

    return data ? mapNotificationDevice(data) : null;
  }
}
