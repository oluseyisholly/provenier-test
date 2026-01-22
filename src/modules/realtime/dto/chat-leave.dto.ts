import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatLeaveDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @Length(1, 64)
  userId: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  tabId?: string;
}
