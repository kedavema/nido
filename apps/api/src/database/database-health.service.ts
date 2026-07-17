import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async assertReady(): Promise<void> {
    await this.prisma.assertReady();
  }
}
