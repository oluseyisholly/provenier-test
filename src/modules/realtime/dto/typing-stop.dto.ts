import { IsString, IsUUID, Length } from 'class-validator';

export class TypingStopDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @Length(1, 64)
  userId: string;
}
