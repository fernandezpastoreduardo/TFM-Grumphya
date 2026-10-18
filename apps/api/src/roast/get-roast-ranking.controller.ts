import { Controller, Get, Inject } from "@nestjs/common";
import { GetRoastRanking } from "./get-roast-ranking.service";

@Controller("roast-ranking")
export class GetRoastRankingController {
  constructor(
    @Inject(GetRoastRanking)
    private readonly getRoastRanking: GetRoastRanking,
  ) {}

  @Get()
  list() {
    return this.getRoastRanking.execute();
  }
}
