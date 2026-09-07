import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getAll(@Request() req: any) {
    return this.notificationsService.getUserNotifications(req.user.sub);
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  @Put(':id/read')
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.sub, id);
  }

  @Put('mark-all-read')
  markAllRead(@Request() req: any) {
    return this.notificationsService.markAllRead(req.user.sub);
  }

  @Post()
  create(@Request() req: any, @Body() dto: any) {
    return this.notificationsService.createNotification(req.user.sub, dto);
  }

  @Post('price-alert')
  sendPriceAlert(
    @Body('cropName') cropName: string,
    @Body('newPrice') newPrice: number,
    @Body('changePct') changePct: string,
  ) {
    return this.notificationsService.broadcastPriceAlert(cropName, newPrice, changePct || '+5%');
  }

  @Post('weather-alert')
  sendWeatherAlert(
    @Body('region') region: string,
    @Body('forecast') forecast: string,
  ) {
    return this.notificationsService.broadcastWeatherAlert(region || 'Your Region', forecast);
  }
}
