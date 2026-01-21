import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';

export interface MatchSummary {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  startsAt: string | null;
}

@Injectable()
export class MatchesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getMatches(): Promise<MatchSummary[]> {
    const { data, error } = await this.supabaseService.client
      .from('matches')
      .select(
        'id, home_team, away_team, home_score, away_score, minute, status, starts_at',
      )
      .neq('status', 'FULL_TIME')
      .order('starts_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((match) => ({
      id: match.id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      homeScore: match.home_score,
      awayScore: match.away_score,
      minute: match.minute,
      status: match.status,
      startsAt: match.starts_at,
    }));
  }

  async getMatchById(id: string) {
    const { data: match, error } = await this.supabaseService.client
      .from('matches')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!match) {
      throw new NotFoundException(`Match ${id} not found`);
    }

    const { data: events, error: eventsError } = await this.supabaseService.client
      .from('match_events')
      .select('*')
      .eq('match_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (eventsError) {
      throw new Error(eventsError.message);
    }

    const { data: stats, error: statsError } = await this.supabaseService.client
      .from('match_stats')
      .select('*')
      .eq('match_id', id)
      .maybeSingle();

    if (statsError) {
      throw new Error(statsError.message);
    }

    return {
      match,
      events: events ?? [],
      stats,
    };
  }
}
