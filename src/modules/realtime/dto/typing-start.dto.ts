import { IsString, IsUUID, Length } from 'class-validator';

export class TypingStartDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @Length(1, 64)
  userId: string;

  @IsString()
  @Length(1, 64)
  userName: string;
}
