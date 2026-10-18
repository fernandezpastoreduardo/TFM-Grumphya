import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  RoastRankingItem,
  RoastRankingRepository,
} from "./roast-ranking.models";
import { ROAST_RANKING_REPOSITORY } from "./roast-ranking.models";

const RANKING_UNAVAILABLE = {
  code: "ROAST_RANKING_UNAVAILABLE",
  message: "No se ha podido cargar el ranking de roast ahora.",
};

@Injectable()
export class GetRoastRanking {
  private readonly logger = new Logger(GetRoastRanking.name);

  constructor(
    @Inject(ROAST_RANKING_REPOSITORY)
    private readonly repository: RoastRankingRepository,
  ) {}

  async execute(): Promise<RoastRankingItem[]> {
    try {
      return await this.repository.getRoastRanking();
    } catch {
      this.logger.error("ROAST_RANKING_UNAVAILABLE");
      throw new ServiceUnavailableException(RANKING_UNAVAILABLE);
    }
  }
}
