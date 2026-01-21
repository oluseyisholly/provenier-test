import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatJoinDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @Length(1, 64)
  userId: string;

  @IsString()
  @Length(1, 64)
  userName: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  tabId?: string;
}
