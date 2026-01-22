import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../integrations/redis/redis.service';
import { SupabaseService } from '../../integrations/supabase/supabase.service';

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();
  private readonly presenceTtlSeconds = 60;
  private readonly typingTtlSeconds = 5;
  private readonly messageRateLimit: RateLimitConfig = {
    limit: 5,
    windowMs: 10_000,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async registerPresence(matchId: string, userId: string, tabId: string) {
    const key = this.presenceKey(matchId, userId, tabId);
    await this.redisService
      .getClient()
      .set(key, '1', 'EX', this.presenceTtlSeconds);
  }

  async refreshPresence(matchId: string, userId: string, tabId: string) {
    const key = this.presenceKey(matchId, userId, tabId);
    await this.redisService
      .getClient()
      .expire(key, this.presenceTtlSeconds);
  }

  async removePresence(matchId: string, userId: string, tabId: string) {
    const key = this.presenceKey(matchId, userId, tabId);
    await this.redisService.getClient().del(key);
  }

  async getUserCount(matchId: string): Promise<number> {
    const keys = await this.redisService
      .getClient()
      .keys(`presence:${matchId}:*`);
    const uniqueUsers = new Set(keys.map((key) => key.split(':')[2]));
    return uniqueUsers.size;
  }

  async startTyping(
    matchId: string,
    userId: string,
    userName: string,
    broadcast: (payload: unknown) => void,
  ) {
    const key = this.typingKey(matchId, userId);
    await this.redisService
      .getClient()
      .set(key, userName, 'EX', this.typingTtlSeconds);

    broadcast({ matchId, userId, userName, isTyping: true });

    const timerKey = `${matchId}:${userId}`;
    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      broadcast({ matchId, userId, userName, isTyping: false });
      this.typingTimers.delete(timerKey);
    }, this.typingTtlSeconds * 1000);

    this.typingTimers.set(timerKey, timeout);
  }

  async stopTyping(
    matchId: string,
    userId: string,
    broadcast: (payload: unknown) => void,
  ) {
    const key = this.typingKey(matchId, userId);
    await this.redisService.getClient().del(key);
    const timerKey = `${matchId}:${userId}`;
    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }
    broadcast({ matchId, userId, isTyping: false });
  }

  async canSendMessage(matchId: string, userId: string): Promise<boolean> {
    const window = Math.floor(Date.now() / this.messageRateLimit.windowMs);
    const key = `rate:${matchId}:${userId}:${window}`;
    const count = await this.redisService.getClient().incr(key);
    if (count === 1) {
      await this.redisService
        .getClient()
        .expire(key, Math.ceil(this.messageRateLimit.windowMs / 1000));
    }
    return count <= this.messageRateLimit.limit;
  }

  async saveChatMessage(payload: {
    matchId: string;
    userId: string;
    userName: string;
    message: string;
  }) {
    const { error, data } = await this.supabaseService.client
      .from('chat_messages')
      .insert({
        match_id: payload.matchId,
        user_id: payload.userId,
        user_name: payload.userName,
        message: payload.message,
      })
      .select('*')
      .single();

    if (error) {
      this.logger.error('Failed to store chat message', error);
      throw new Error('Failed to store chat message');
    }

    return data;
  }

  private presenceKey(matchId: string, userId: string, tabId: string) {
    return `presence:${matchId}:${userId}:${tabId}`;
  }

  private typingKey(matchId: string, userId: string) {
    return `typing:${matchId}:${userId}`;
  }
}
