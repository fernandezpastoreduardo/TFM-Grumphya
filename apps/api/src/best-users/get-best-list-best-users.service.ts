import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { BestUserItem, BestUsersRepository } from "./best-users.models";
import { BEST_USERS_REPOSITORY, MAX_BEST_USERS } from "./best-users.models";
import { isPublicAvatarUrl } from "../infrastructure/avatar/public-avatar-url";

const BEST_USERS_UNAVAILABLE = {
  code: "BEST_USERS_UNAVAILABLE",
  message: "No se ha podido cargar la clasificación ahora.",
};

const PUBLIC_USERNAME_PATTERN =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;

function isPublicBestUser(value: unknown): value is BestUserItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.username === "string" &&
    PUBLIC_USERNAME_PATTERN.test(item.username) &&
    typeof item.approvedIdeasCount === "number" &&
    Number.isSafeInteger(item.approvedIdeasCount) &&
    item.approvedIdeasCount > 0 &&
    (item.avatarUrl === undefined ||
      item.avatarUrl === null ||
      isPublicAvatarUrl(item.avatarUrl))
  );
}

@Injectable()
export class GetBestListBestUsers {
  private readonly logger = new Logger(GetBestListBestUsers.name);

  constructor(
    @Inject(BEST_USERS_REPOSITORY)
    private readonly repository: BestUsersRepository,
  ) {}

  async execute(): Promise<BestUserItem[]> {
    try {
      const users = await this.repository.getBestListBestUsers();
      if (!Array.isArray(users) || !users.every(isPublicBestUser)) {
        throw new Error("Invalid best-users repository result");
      }
      return users.slice(0, MAX_BEST_USERS).map((user) => ({
        username: user.username,
        approvedIdeasCount: user.approvedIdeasCount,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      }));
    } catch {
      this.logger.error(BEST_USERS_UNAVAILABLE.code);
      throw new ServiceUnavailableException(BEST_USERS_UNAVAILABLE);
    }
  }
}
