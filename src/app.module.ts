import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { MatchesModule } from './modules/matches/matches.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { StreamModule } from './modules/stream/stream.module';
import { SimulatorModule } from './modules/simulator/simulator.module';
import { SupabaseModule } from './integrations/supabase/supabase.module';
import { RedisModule } from './integrations/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    SupabaseModule,
    RedisModule,
    MatchesModule,
    RealtimeModule,
    StreamModule,
    SimulatorModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
