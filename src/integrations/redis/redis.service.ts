import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly publisher: Redis;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('Redis configuration is missing.');
    }

    const options: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    };

    this.client = new Redis(url, options);
    this.publisher = new Redis(url, options);

    this.client.on('error', (error) =>
      this.logger.error('Redis client error', error),
    );
    this.publisher.on('error', (error) =>
      this.logger.error('Redis publisher error', error),
    );
  }

  getClient(): Redis {
    return this.client;
  }

  getPublisher(): Redis {
    return this.publisher;
  }

  createSubscriber(): Redis {
    return new Redis(this.configService.get<string>('redis.url') ?? '');
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client.quit(), this.publisher.quit()]);
  }
}
