import { IsString, IsUUID, Length } from 'class-validator';

export class ChatMessageDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @Length(1, 64)
  userId: string;

  @IsString()
  @Length(1, 64)
  userName: string;

  @IsString()
  @Length(1, 280)
  message: string;
}
