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
import { isPublicAvatarUrl } from "../infrastructure/avatar/public-avatar-url";

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
      const ranking = await this.repository.getRoastRanking();
      if (!Array.isArray(ranking) || !ranking.every(isPublicRankingItem)) {
        throw new Error("Invalid roast ranking result.");
      }
      return ranking.map((item) => ({
        username: item.username,
        roastMessagesSent: item.roastMessagesSent,
        ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}),
      }));
    } catch {
      this.logger.error("ROAST_RANKING_UNAVAILABLE");
      throw new ServiceUnavailableException(RANKING_UNAVAILABLE);
    }
  }
}

function isPublicRankingItem(value: unknown): value is RoastRankingItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.username === "string" &&
    typeof item.roastMessagesSent === "number" &&
    Number.isSafeInteger(item.roastMessagesSent) &&
    item.roastMessagesSent > 0 &&
    (item.avatarUrl === undefined ||
      item.avatarUrl === null ||
      isPublicAvatarUrl(item.avatarUrl))
  );
}
