export type PasswordResetTarget = { userId: string; email: string };

export interface PasswordResetRepository {
  replaceToken(
    normalizedEmail: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetTarget | null>;
  consumeToken(tokenHash: string, passwordHash: string): Promise<boolean>;
  invalidateToken(userId: string, tokenHash: string): Promise<void>;
}

export const PASSWORD_RESET_REPOSITORY = Symbol("PASSWORD_RESET_REPOSITORY");
