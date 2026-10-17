import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { IdeaListItemWorstAll } from "./worst-ideas.models";
import type { WorstIdeasRepository } from "./worst-ideas.models";
import { WORST_IDEAS_REPOSITORY } from "./worst-ideas.tokens";

const RANKING_UNAVAILABLE = {
  code: "WORST_IDEAS_UNAVAILABLE",
  message: "No se ha podido cargar el ranking ahora.",
};

@Injectable()
export class GetIdeaListWorstAll {
  private readonly logger = new Logger(GetIdeaListWorstAll.name);

  constructor(
    @Inject(WORST_IDEAS_REPOSITORY)
    private readonly repository: WorstIdeasRepository,
  ) {}

  async execute(): Promise<IdeaListItemWorstAll[]> {
    try {
      return await this.repository.getIdeaListWorstAll();
    } catch {
      this.logger.error("WORST_IDEAS_RANKING_UNAVAILABLE");
      throw new ServiceUnavailableException(RANKING_UNAVAILABLE);
    }
  }
}
