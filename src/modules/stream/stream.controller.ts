import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { StreamService } from './stream.service';

@Controller('api/matches')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get(':id/events/stream')
  async stream(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('since') since: string | undefined,
    @Res() res: Response,
  ) {
    await this.streamService.streamMatchEvents(id, res, since);
  }
}
