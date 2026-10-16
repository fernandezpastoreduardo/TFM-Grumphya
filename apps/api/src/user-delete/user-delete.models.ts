export const USER_DELETE_REPOSITORY = Symbol("USER_DELETE_REPOSITORY");

export interface UserDeleteRepository {
  deleteUser(userId: string): Promise<boolean>;
}

export class UserDeleteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UserDeleteError";
  }
}
