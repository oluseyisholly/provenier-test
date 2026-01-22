import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { RedisModule } from '../../integrations/redis/redis.module';
import { SupabaseModule } from '../../integrations/supabase/supabase.module';

@Module({
  imports: [RedisModule, SupabaseModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
