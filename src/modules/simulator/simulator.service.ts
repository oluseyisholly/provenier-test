import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { RedisService } from '../../integrations/redis/redis.service';

interface MatchState {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  halfTimeRemaining: number;
}

interface MatchStats {
  possession_home: number;
  possession_away: number;
  shots_home: number;
  shots_away: number;
  fouls_home: number;
  fouls_away: number;
  corners_home: number;
  corners_away: number;
}

@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly matches = new Map<string, MatchState>();
  private readonly stats = new Map<string, MatchStats>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedMatches();
    const minuteMs = this.configService.get<number>('simulator.minuteMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, minuteMs);
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async seedMatches() {
    const { data, error } = await this.supabaseService.client
      .from('matches')
      .select('*');

    if (error) {
      this.logger.error('Failed to load matches', error);
      return;
    }

    const matchCount = this.configService.get<number>('simulator.matchCount') ?? 5;

    if ((data ?? []).length === 0) {
      const teams = [
        'Arsenal',
        'Chelsea',
        'Liverpool',
        'Manchester City',
        'Manchester United',
        'Tottenham',
        'Barcelona',
        'Real Madrid',
        'Bayern Munich',
        'PSG',
      ];

      for (let i = 0; i < matchCount; i += 1) {
        const homeTeam = teams[(i * 2) % teams.length];
        const awayTeam = teams[(i * 2 + 1) % teams.length];

        const { data: inserted, error: insertError } = await this.supabaseService.client
          .from('matches')
          .insert({
            home_team: homeTeam,
            away_team: awayTeam,
            home_score: 0,
            away_score: 0,
            minute: 0,
            status: 'NOT_STARTED',
            starts_at: new Date(Date.now() + i * 60_000).toISOString(),
          })
          .select('*')
          .single();

        if (insertError) {
          this.logger.error('Failed to seed match', insertError);
          continue;
        }

        await this.supabaseService.client.from('match_stats').insert({
          match_id: inserted.id,
          possession_home: 50,
          possession_away: 50,
          shots_home: 0,
          shots_away: 0,
          fouls_home: 0,
          fouls_away: 0,
          corners_home: 0,
          corners_away: 0,
        });
      }
    }

    const { data: refreshed, error: refreshError } = await this.supabaseService.client
      .from('matches')
      .select('*')
      .neq('status', 'FULL_TIME');

    if (refreshError) {
      this.logger.error('Failed to refresh matches', refreshError);
      return;
    }

    refreshed?.forEach((match) => {
      this.matches.set(match.id, {
        id: match.id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        homeScore: match.home_score,
        awayScore: match.away_score,
        minute: match.minute,
        status: match.status,
        halfTimeRemaining: 0,
      });
      this.stats.set(match.id, {
        possession_home: 50,
        possession_away: 50,
        shots_home: 0,
        shots_away: 0,
        fouls_home: 0,
        fouls_away: 0,
        corners_home: 0,
        corners_away: 0,
      });
    });
  }

  private async tick() {
    for (const match of this.matches.values()) {
      await this.advanceMatch(match);
    }
  }

  private async advanceMatch(match: MatchState) {
    if (match.status === 'FULL_TIME') {
      return;
    }

    if (match.status === 'NOT_STARTED') {
      match.status = 'FIRST_HALF';
      match.minute = 1;
      await this.persistMatch(match);
      await this.emitEvent(match, 'START_HALF', { half: 1 });
      return;
    }

    if (match.status === 'FIRST_HALF') {
      if (match.minute >= 45) {
        match.status = 'HALF_TIME';
        match.halfTimeRemaining = 2;
        await this.persistMatch(match);
        await this.emitEvent(match, 'HALF_TIME', {});
        return;
      }
      match.minute += 1;
      await this.handleRandomEvents(match);
      await this.persistMatch(match);
      return;
    }

    if (match.status === 'HALF_TIME') {
      match.halfTimeRemaining -= 1;
      if (match.halfTimeRemaining <= 0) {
        match.status = 'SECOND_HALF';
        match.minute = 46;
        await this.persistMatch(match);
        await this.emitEvent(match, 'START_HALF', { half: 2 });
      }
      return;
    }

    if (match.status === 'SECOND_HALF') {
      if (match.minute >= 90) {
        match.status = 'FULL_TIME';
        await this.persistMatch(match);
        await this.emitEvent(match, 'FULL_TIME', {});
        return;
      }
      match.minute += 1;
      await this.handleRandomEvents(match);
      await this.persistMatch(match);
    }
  }

  private async handleRandomEvents(match: MatchState) {
    const stats = this.stats.get(match.id);
    if (!stats) {
      return;
    }

    const roll = Math.random();
    if (roll < 0.03) {
      const isHome = Math.random() > 0.5;
      if (isHome) {
        match.homeScore += 1;
      } else {
        match.awayScore += 1;
      }
      await this.emitEvent(match, 'GOAL', {
        team: isHome ? match.homeTeam : match.awayTeam,
      });
      await this.emitScore(match);
    } else if (roll < 0.07) {
      await this.emitEvent(match, 'YELLOW_CARD', {
        team: Math.random() > 0.5 ? match.homeTeam : match.awayTeam,
        cardReason: 'Late tackle',
      });
    } else if (roll < 0.08) {
      await this.emitEvent(match, 'RED_CARD', {
        team: Math.random() > 0.5 ? match.homeTeam : match.awayTeam,
        cardReason: 'Serious foul play',
      });
    } else if (roll < 0.18) {
      const isHome = Math.random() > 0.5;
      if (isHome) {
        stats.fouls_home += 1;
      } else {
        stats.fouls_away += 1;
      }
      await this.emitEvent(match, 'FOUL', {
        team: isHome ? match.homeTeam : match.awayTeam,
      });
    } else if (roll < 0.28) {
      const isHome = Math.random() > 0.5;
      if (isHome) {
        stats.shots_home += 1;
      } else {
        stats.shots_away += 1;
      }
      await this.emitEvent(match, 'SHOT', {
        team: isHome ? match.homeTeam : match.awayTeam,
        shotType: 'On target',
      });
    } else if (roll < 0.32 && match.minute > 60) {
      await this.emitEvent(match, 'SUBSTITUTION', {
        team: Math.random() > 0.5 ? match.homeTeam : match.awayTeam,
        subIn: 'Player In',
        subOut: 'Player Out',
      });
    }

    const possessionSwing = Math.floor(Math.random() * 7) - 3;
    stats.possession_home = Math.min(60, Math.max(40, stats.possession_home + possessionSwing));
    stats.possession_away = 100 - stats.possession_home;
    await this.persistStats(match.id, stats);
    await this.emitStats(match.id, stats);
  }

  private async persistMatch(match: MatchState) {
    await this.supabaseService.client
      .from('matches')
      .update({
        home_score: match.homeScore,
        away_score: match.awayScore,
        minute: match.minute,
        status: match.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id);
  }

  private async persistStats(matchId: string, stats: MatchStats) {
    await this.supabaseService.client
      .from('match_stats')
      .update({
        ...stats,
        updated_at: new Date().toISOString(),
      })
      .eq('match_id', matchId);
  }

  private async emitScore(match: MatchState) {
    await this.redisService.publish(`match:${match.id}:score`, {
      matchId: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      minute: match.minute,
      status: match.status,
    });
  }

  private async emitStats(matchId: string, stats: MatchStats) {
    await this.redisService.publish(`match:${matchId}:stats`, {
      matchId,
      stats,
    });
  }

  private async emitEvent(match: MatchState, type: string, payload: Record<string, unknown>) {
    const { data, error } = await this.supabaseService.client
      .from('match_events')
      .insert({
        match_id: match.id,
        minute: match.minute,
        type,
        payload,
      })
      .select('*')
      .single();

    if (error) {
      this.logger.error('Failed to insert match event', error);
      return;
    }

    await this.redisService.publish(`match:${match.id}:event`, {
      matchId: match.id,
      event: data,
    });
  }
}
