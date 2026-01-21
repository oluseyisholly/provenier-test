import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RedisService } from '../../integrations/redis/redis.service';
import { RealtimeService } from './realtime.service';
import { MatchSubscriptionDto } from './dto/match-subscription.dto';
import { ChatJoinDto } from './dto/chat-join.dto';
import { ChatLeaveDto } from './dto/chat-leave.dto';
import { ChatMessageDto } from './dto/chat-message.dto';
import { TypingStartDto } from './dto/typing-start.dto';
import { TypingStopDto } from './dto/typing-stop.dto';
import Redis from 'ioredis';

interface PresenceEntry {
  matchId: string;
  userId: string;
  userName?: string;
  tabId: string;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly realtimeService: RealtimeService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    if (!server.engine?.opts) {
      this.logger.warn('Socket.IO engine not initialized; skipping ping config.');
      return;
    }
    server.engine.opts.pingInterval =
      this.configService.get<number>('realtime.pingInterval') ?? 25000;
    server.engine.opts.pingTimeout =
      this.configService.get<number>('realtime.pingTimeout') ?? 20000;
  }

  async onModuleInit() {
    this.subscriber = this.redisService.createSubscriber();
    await this.subscriber.psubscribe('match:*:score', 'match:*:event', 'match:*:stats');
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const payload = JSON.parse(message);
      const matchId = channel.split(':')[1];
      if (channel.endsWith(':score')) {
        this.server.to(`match:${matchId}`).emit('match:score', payload);
        return;
      }
      if (channel.endsWith(':stats')) {
        this.server.to(`match:${matchId}`).emit('match:stats', payload);
        return;
      }
      this.server.to(`match:${matchId}`).emit('match:event', payload);
    });
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  handleConnection(@ConnectedSocket() socket: Socket) {
    socket.data.presence = [] as PresenceEntry[];
    socket.data.refreshInterval = setInterval(() => {
      const entries = socket.data.presence as PresenceEntry[];
      entries.forEach((entry) => {
        void this.realtimeService.refreshPresence(
          entry.matchId,
          entry.userId,
          entry.tabId,
        );
      });
    }, 30_000);
  }

  async handleDisconnect(@ConnectedSocket() socket: Socket) {
    const entries = socket.data.presence as PresenceEntry[];
    if (entries?.length) {
      for (const entry of entries) {
        await this.realtimeService.removePresence(
          entry.matchId,
          entry.userId,
          entry.tabId,
        );
        const userCount = await this.realtimeService.getUserCount(entry.matchId);
        this.server.to(`chat:${entry.matchId}`).emit('chat:user_left', {
          matchId: entry.matchId,
          userId: entry.userId,
          userName: entry.userName,
          userCount,
        });
      }
    }

    if (socket.data.refreshInterval) {
      clearInterval(socket.data.refreshInterval as NodeJS.Timeout);
    }
  }

  @SubscribeMessage('match:subscribe')
  async subscribeMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(MatchSubscriptionDto, payload, socket);
    if (!dto) {
      return;
    }
    await socket.join(`match:${dto.matchId}`);
  }

  @SubscribeMessage('match:unsubscribe')
  async unsubscribeMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(MatchSubscriptionDto, payload, socket);
    if (!dto) {
      return;
    }
    await socket.leave(`match:${dto.matchId}`);
  }

  @SubscribeMessage('chat:join')
  async joinChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(ChatJoinDto, payload, socket);
    if (!dto) {
      return;
    }

    const tabId = dto.tabId ?? socket.id;
    await socket.join(`chat:${dto.matchId}`);
    await this.realtimeService.registerPresence(dto.matchId, dto.userId, tabId);

    const entries = socket.data.presence as PresenceEntry[];
    entries.push({
      matchId: dto.matchId,
      userId: dto.userId,
      userName: dto.userName,
      tabId,
    });

    const userCount = await this.realtimeService.getUserCount(dto.matchId);
    this.server.to(`chat:${dto.matchId}`).emit('chat:user_joined', {
      matchId: dto.matchId,
      userId: dto.userId,
      userName: dto.userName,
      userCount,
    });
  }

  @SubscribeMessage('chat:leave')
  async leaveChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(ChatLeaveDto, payload, socket);
    if (!dto) {
      return;
    }

    const tabId = dto.tabId ?? socket.id;
    await socket.leave(`chat:${dto.matchId}`);
    await this.realtimeService.removePresence(dto.matchId, dto.userId, tabId);

    socket.data.presence = (socket.data.presence as PresenceEntry[]).filter(
      (entry) =>
        !(
          entry.matchId === dto.matchId &&
          entry.userId === dto.userId &&
          entry.tabId === tabId
        ),
    );

    const userCount = await this.realtimeService.getUserCount(dto.matchId);
    this.server.to(`chat:${dto.matchId}`).emit('chat:user_left', {
      matchId: dto.matchId,
      userId: dto.userId,
      userCount,
    });
  }

  @SubscribeMessage('chat:message')
  async chatMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(ChatMessageDto, payload, socket);
    if (!dto) {
      return;
    }

    const trimmed = dto.message.trim();
    if (!trimmed) {
      this.emitError(socket, 'BAD_REQUEST', 'Message cannot be empty');
      return;
    }

    const canSend = await this.realtimeService.canSendMessage(dto.matchId, dto.userId);
    if (!canSend) {
      this.emitError(socket, 'RATE_LIMIT', 'Too many messages. Slow down.');
      return;
    }

    const saved = await this.realtimeService.saveChatMessage({
      matchId: dto.matchId,
      userId: dto.userId,
      userName: dto.userName,
      message: trimmed,
    });

    this.server.to(`chat:${dto.matchId}`).emit('chat:message', {
      matchId: dto.matchId,
      message: saved,
    });
  }

  @SubscribeMessage('chat:typing_start')
  async typingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(TypingStartDto, payload, socket);
    if (!dto) {
      return;
    }

    await this.realtimeService.startTyping(dto.matchId, dto.userId, dto.userName, (data) => {
      this.server.to(`chat:${dto.matchId}`).emit('chat:typing', data);
    });
  }

  @SubscribeMessage('chat:typing_stop')
  async typingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const dto = await this.validatePayload(TypingStopDto, payload, socket);
    if (!dto) {
      return;
    }

    await this.realtimeService.stopTyping(dto.matchId, dto.userId, (data) => {
      this.server.to(`chat:${dto.matchId}`).emit('chat:typing', data);
    });
  }

  private emitError(socket: Socket, code: string, message: string, details?: unknown) {
    socket.emit('error', { code, message, details });
  }

  private async validatePayload<T>(
    type: new () => T,
    payload: unknown,
    socket: Socket,
  ): Promise<T | null> {
    const dto = plainToInstance(type, payload);
    const errors = await validate(dto as object);
    if (errors.length > 0) {
      this.emitError(socket, 'BAD_REQUEST', 'Invalid payload', errors);
      return null;
    }
    return dto;
  }
}
