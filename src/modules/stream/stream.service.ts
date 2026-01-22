import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { RedisService } from '../../integrations/redis/redis.service';
import { SupabaseService } from '../../integrations/supabase/supabase.service';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async streamMatchEvents(
    matchId: string,
    res: Response,
    since?: string,
  ): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let eventId = 0;

    const send = (event: string, data: unknown) => {
      eventId += 1;
      res.write(`id: ${eventId}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { matchId, timestamp: new Date().toISOString() });

    if (since) {
      const { data: events, error } = await this.supabaseService.client
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        this.logger.error('Failed to load events for SSE', error);
      } else {
        events?.forEach((event) => send('match:event', event));
      }
    }

    const subscriber = this.redisService.createSubscriber();
    await subscriber.subscribe(
      `match:${matchId}:score`,
      `match:${matchId}:event`,
      `match:${matchId}:stats`,
    );

    const onMessage = (channel: string, message: string) => {
      const payload = JSON.parse(message);
      if (channel.endsWith(':score')) {
        send('match:score', payload);
        return;
      }
      if (channel.endsWith(':stats')) {
        send('match:stats', payload);
        return;
      }
      send('match:event', payload);
    };

    subscriber.on('message', onMessage);

    const close = async () => {
      subscriber.removeListener('message', onMessage);
      await subscriber.unsubscribe();
      await subscriber.quit();
      res.end();
    };

    res.on('close', () => {
      void close();
    });
  }
}
