import { Module } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { SupabaseModule } from '../../integrations/supabase/supabase.module';
import { RedisModule } from '../../integrations/redis/redis.module';

@Module({
  imports: [SupabaseModule, RedisModule],
  providers: [SimulatorService],
})
export class SimulatorModule {}
