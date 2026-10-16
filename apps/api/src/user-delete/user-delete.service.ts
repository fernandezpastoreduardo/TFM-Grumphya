import {
  UserDeleteError,
  type UserDeleteRepository,
} from "./user-delete.models";

const SESSION_REQUIRED = "Inicia sesión para darte de baja.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UserDeleteService {
  constructor(private readonly repository: UserDeleteRepository) {}

  async deleteCurrentUser(userId: unknown): Promise<void> {
    if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      throw new UserDeleteError(401, "SESSION_REQUIRED", SESSION_REQUIRED);
    }
    const deleted = await this.repository.deleteUser(userId);
    if (!deleted) {
      throw new UserDeleteError(401, "SESSION_REQUIRED", SESSION_REQUIRED);
    }
  }
}
