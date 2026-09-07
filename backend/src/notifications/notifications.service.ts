import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async createNotification(userId: string, dto: { title: string; body: string; type?: string }) {
    return this.prisma.notification.create({
      data: {
        userId,
        title: dto.title,
        body: dto.body,
        type: dto.type || 'INFO',
      },
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  // Step 21 — Helper alert generators for weather, price, supply alerts
  async broadcastPriceAlert(cropName: string, newPrice: number, changePct: string) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['FARMER', 'BUYER'] } },
      select: { id: true },
    });

    const notifs = users.map((u) => ({
      userId: u.id,
      title: `Price Alert: ${cropName}`,
      body: `Market price for ${cropName} updated to ₹${newPrice}/kg (${changePct}). Check mandi trends now.`,
      type: 'PRICE_ALERT',
    }));

    await this.prisma.notification.createMany({ data: notifs });
    return { broadcastedCount: notifs.length };
  }

  async broadcastWeatherAlert(region: string, forecast: string) {
    const users = await this.prisma.user.findMany({
      where: { role: 'FARMER' },
      select: { id: true },
    });

    const notifs = users.map((u) => ({
      userId: u.id,
      title: `Weather Alert: ${region}`,
      body: `Forecast: ${forecast}. Take necessary precautions for your standing crops.`,
      type: 'WEATHER_ALERT',
    }));

    await this.prisma.notification.createMany({ data: notifs });
    return { broadcastedCount: notifs.length };
  }
}
