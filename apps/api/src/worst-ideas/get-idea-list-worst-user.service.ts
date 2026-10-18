import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { IdeaListItemWorstUser } from "./worst-ideas.models";
import { MAX_WORST_IDEA_LIST_ITEMS } from "./worst-ideas.models";
import type { WorstIdeasRepository } from "./worst-ideas.models";
import { WORST_IDEAS_REPOSITORY } from "./worst-ideas.tokens";

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_REQUIRED = {
  code: "WORST_IDEAS_USER_UNAVAILABLE",
  message: "No se ha podido cargar tu historial ahora.",
};

@Injectable()
export class GetIdeaListWorstUser {
  private readonly logger = new Logger(GetIdeaListWorstUser.name);

  constructor(
    @Inject(WORST_IDEAS_REPOSITORY)
    private readonly repository: WorstIdeasRepository,
  ) {}

  async execute(userId: unknown): Promise<IdeaListItemWorstUser[]> {
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId))
      throw new ServiceUnavailableException(USER_ID_REQUIRED);
    try {
      const history = await this.repository.getIdeaListWorstUser(userId);
      return history.slice(0, MAX_WORST_IDEA_LIST_ITEMS);
    } catch {
      this.logger.error("WORST_IDEAS_USER_HISTORY_UNAVAILABLE");
      throw new ServiceUnavailableException(USER_ID_REQUIRED);
    }
  }
}
