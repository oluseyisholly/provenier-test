import { IsUUID } from 'class-validator';

export class MatchSubscriptionDto {
  @IsUUID()
  matchId: string;
}
