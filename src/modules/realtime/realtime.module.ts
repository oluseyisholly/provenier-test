import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RedisModule } from '../../integrations/redis/redis.module';
import { SupabaseModule } from '../../integrations/supabase/supabase.module';

@Module({
  imports: [RedisModule, SupabaseModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
