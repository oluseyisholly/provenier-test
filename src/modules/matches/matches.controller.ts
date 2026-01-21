import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { MatchesService } from './matches.service';

@Controller('api/matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async getMatches() {
    return this.matchesService.getMatches();
  }

  @Get(':id')
  async getMatch(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.matchesService.getMatchById(id);
  }
}
