import { createHash, randomBytes } from "node:crypto";
import { domainToASCII } from "node:url";
import { Logger } from "@nestjs/common";
import {
  RegistrationError,
  type PlanCode,
  type RegistrationInput,
  type RegistrationIntent,
  type VerifiedResult,
  type SessionIssue,
  type SessionIdentity,
  type AccountProfile,
  type UserGoodIdeas,
  type RegistrationPendingResult,
  type PendingRegistration,
} from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueAccessToken,
} from "../infrastructure/auth/access-token";
import { hashAccessToken } from "../infrastructure/auth/access-token-session.lookup";
import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from "../infrastructure/auth/password-hasher";
import { ADMIN_RESERVED_USERNAME } from "../infrastructure/auth/reserved-usernames";
import { isStrongPassword } from "../infrastructure/auth/password-policy";
import type { MailService } from "../infrastructure/mail/mail.service";
import { renderGrumphyaEmail } from "../infrastructure/mail/grumphya-email";
export { verifyPassword } from "../infrastructure/auth/password-hasher";
const INTENT_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFIED_SESSION_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_RESPONSE_FLOOR_MS = 350;
const GENERIC_LOGIN_ERROR = {
  status: 401,
  code: "LOGIN_UNAVAILABLE",
  message:
    "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.",
} as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

class VerificationDeliveryError extends Error {}

function validateResendEmail(value: unknown): string {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "email") ||
    typeof value.email !== "string"
  ) {
    throw new RegistrationError(
      400,
      "INVALID_EMAIL",
      "Escribe un correo válido.",
    );
  }
  const email = normalizeEmail(value.email);
  if (!email)
    throw new RegistrationError(
      400,
      "INVALID_EMAIL",
      "Escribe un correo válido.",
    );
  return email;
}

function getVerificationOrigin(): string {
  const configuredOrigin = process.env.WEB_ORIGIN;
  if (!configuredOrigin) throw new VerificationDeliveryError();
  try {
    const origin = new URL(configuredOrigin);
    if (
      origin.origin !== configuredOrigin.replace(/\/$/u, "") ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    ) {
      throw new Error("Invalid web origin.");
    }
    return origin.origin;
  } catch {
    throw new VerificationDeliveryError();
  }
}

function classifyDeliveryError(): string {
  return "MAIL_DELIVERY_FAILED";
}

async function waitForMinimumDuration(startedAt: number, minimumMs: number) {
  const remainingMs = minimumMs - (Date.now() - startedAt);
  if (remainingMs > 0)
    await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
}

export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly repository: RegistrationRepository,
    private readonly mail: Pick<MailService, "send">,
  ) {}

  async createIntent(value: unknown): Promise<RegistrationIntent> {
    if (value !== "ILUMINADO" && value !== "FALTON") {
      throw new RegistrationError(
        400,
        "INVALID_PLAN",
        "Selecciona un plan válido.",
      );
    }
    const token = newToken();
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    await this.repository.createIntent(value, hashToken(token), expiresAt);
    return { token, plan: value, expiresAt };
  }

  currentIntent(token: string | undefined): Promise<PlanCode | null> {
    if (!token) return Promise.resolve(null);
    return this.repository.currentIntent(hashToken(token));
  }

  async register(
    token: string | undefined,
    value: unknown,
  ): Promise<RegistrationPendingResult> {
    const intentPlan = await this.currentIntent(token);
    if (!token || !intentPlan)
      throw new RegistrationError(
        400,
        "REGISTRATION_INTENT_REQUIRED",
        "Vuelve a elegir un plan para continuar.",
      );
    const input = validateRegistrationInput(value);
    const passwordHash = await hashPassword(input.password);
    const verificationToken = newToken();
    const verificationExpiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_MS,
    );
    let pendingRegistration: PendingRegistration | undefined;
    try {
      pendingRegistration = await this.repository.consumeIntentAndRegister(
        hashToken(token),
        input,
        passwordHash,
        hashToken(verificationToken),
        verificationExpiresAt,
      );
      await this.deliverVerification(
        pendingRegistration.email,
        verificationToken,
      );
      return { status: "verification_pending" };
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      if (isUniqueViolation(error)) return { status: "verification_pending" };
      if (error instanceof VerificationDeliveryError) {
        if (pendingRegistration)
          await this.repository.releaseVerificationResendCooldown(
            pendingRegistration.id,
          );
        this.logger.error("Registration verification delivery failed", {
          errorCode: "MAIL_DELIVERY_FAILED",
        });
        return { status: "verification_pending" };
      }
      throw new RegistrationError(
        503,
        "REGISTRATION_UNAVAILABLE",
        "No se ha podido completar el alta ahora.",
      );
    }
  }

  async resendVerification(value: unknown): Promise<RegistrationPendingResult> {
    const requestStartedAt = Date.now();
    const email = validateResendEmail(value);
    const verificationToken = newToken();
    let pendingRegistration: PendingRegistration | null = null;
    try {
      pendingRegistration = await this.repository.replaceVerificationToken(
        email,
        hashToken(verificationToken),
        new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      );
      if (pendingRegistration)
        await this.deliverVerification(
          pendingRegistration.email,
          verificationToken,
        );
    } catch {
      if (pendingRegistration)
        await this.repository.releaseVerificationResendCooldown(
          pendingRegistration.id,
        );
      this.logger.error("Registration verification delivery failed", {
        errorCode: classifyDeliveryError(),
      });
    } finally {
      await waitForMinimumDuration(requestStartedAt, RESEND_RESPONSE_FLOOR_MS);
    }
    return { status: "verification_pending" };
  }

  private async deliverVerification(
    email: string,
    token: string,
  ): Promise<void> {
    const origin = getVerificationOrigin();
    const verificationUrl = `${origin}/verificar-cuenta#${token}`;
    const content = renderGrumphyaEmail({
      title: "Confirma tu correo",
      preheader: "Un paso breve para terminar de crear tu cuenta.",
      paragraphs: [
        "Has solicitado crear una cuenta en Grumphya.",
        "Confirma tu correo con el botón. El enlace caduca en 24 horas y solo se puede utilizar una vez.",
        "Si no has solicitado esta cuenta, puedes ignorar este mensaje.",
      ],
      action: { label: "Verificar mi correo", url: verificationUrl },
    });
    try {
      await this.mail.send({
        to: email,
        subject: "Confirma tu correo para Grumphya",
        text: content.text,
        html: content.html,
      });
    } catch {
      throw new VerificationDeliveryError();
    }
  }

  async verify(
    token: string,
  ): Promise<{ result: VerifiedResult; confirmationToken: string }> {
    if (!isToken(token))
      throw new RegistrationError(
        400,
        "INVALID_VERIFICATION",
        "El enlace no es válido o ha caducado.",
      );
    const confirmationToken = newToken();
    try {
      const result = await this.repository.verify(
        hashToken(token),
        hashToken(confirmationToken),
        new Date(Date.now() + VERIFIED_SESSION_TTL_MS),
      );
      return { result, confirmationToken };
    } catch {
      throw new RegistrationError(
        400,
        "INVALID_VERIFICATION",
        "El enlace no es válido o ha caducado.",
      );
    }
  }

  async confirm(token: string | undefined): Promise<SessionIssue> {
    if (!token || !isToken(token))
      throw new RegistrationError(
        400,
        "VERIFICATION_REQUIRED",
        "Verifica tu correo antes de confirmar el plan.",
      );
    const userId = await this.repository.getVerifiedRegistrationUserId(
      hashToken(token),
    );
    if (!userId)
      throw new RegistrationError(
        400,
        "VERIFICATION_REQUIRED",
        "Verifica tu correo antes de confirmar el plan.",
      );
    const accessToken = issueAccessToken(userId).token;
    const refreshToken = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    try {
      const registration = await this.repository.confirm(
        hashToken(token),
        hashToken(accessToken),
        hashToken(refreshToken),
        expiresAt,
      );
      const account = await this.repository.getProfile(hashToken(refreshToken));
      if (!account) throw new Error("Confirmed account could not be loaded.");
      return {
        result: {
          status: "active",
          plan: registration.plan,
          account,
          accessToken,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
        refreshToken,
        rememberMe: false,
        expiresAt,
      };
    } catch {
      throw new RegistrationError(
        400,
        "VERIFICATION_REQUIRED",
        "Verifica tu correo antes de confirmar el plan.",
      );
    }
  }

  async refresh(token: string | undefined): Promise<SessionIssue> {
    if (!token || !isToken(token))
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    const previousIdentity = await this.repository.getSessionIdentity(
      hashToken(token),
    );
    if (!previousIdentity)
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    const accessToken = issueAccessToken(previousIdentity.userId).token;
    const refreshToken = newToken();
    try {
      const identity = await this.repository.rotateSession(
        hashToken(token),
        hashToken(accessToken),
        hashToken(refreshToken),
      );
      return this.sessionResult(identity, accessToken, refreshToken);
    } catch {
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    }
  }

  async login(value: unknown): Promise<SessionIssue> {
    if (!isRecord(value)) throw loginUnavailable();
    const allowedFields = new Set(["identifier", "password", "rememberMe"]);
    if (
      Object.keys(value).some((key) => !allowedFields.has(key)) ||
      typeof value.identifier !== "string" ||
      value.identifier.trim().length < 3 ||
      value.identifier.length > 254 ||
      typeof value.password !== "string" ||
      value.password.length > 128 ||
      typeof value.rememberMe !== "boolean"
    ) {
      throw loginUnavailable();
    }
    const identity = await this.repository.findLoginIdentity(value.identifier);
    const passwordMatches = await verifyPassword(
      value.password,
      identity?.passwordHash,
    );
    if (!identity || !passwordMatches) throw loginUnavailable();

    if (needsPasswordRehash(identity.passwordHash)) {
      try {
        const upgradedHash = await hashPassword(value.password);
        await this.repository.updatePasswordHash(
          identity.userId,
          identity.passwordHash,
          upgradedHash,
        );
      } catch {
        this.logger.error("Password hash upgrade failed", {
          errorCode: "PASSWORD_HASH_UPGRADE_FAILED",
        });
      }
    }

    const accessToken = issueAccessToken(identity.userId).token;
    const refreshToken = newToken();
    const rememberMe = value.rememberMe;
    const expiresAt = new Date(
      Date.now() + (rememberMe ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS),
    );
    await this.repository.createSession(
      identity.userId,
      hashAccessToken(accessToken),
      hashToken(refreshToken),
      expiresAt,
      rememberMe,
    );
    const account = await this.repository.getProfileForUser(identity.userId);
    if (!account) throw loginUnavailable();
    const activePlan = account.plans.find((plan) => plan.status === "active");
    return {
      result: {
        status: "active",
        plan: activePlan?.plan ?? "ILUMINADO",
        account,
        accessToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
      refreshToken,
      rememberMe,
      expiresAt,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token && isToken(token))
      await this.repository.revokeSession(hashToken(token));
  }

  async accountProfile(token: string | undefined): Promise<AccountProfile> {
    if (!token || !isToken(token))
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Inicia sesión para consultar tu perfil.",
      );
    const profile = await this.repository.getProfile(hashToken(token));
    if (!profile)
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    return profile;
  }

  async getUserGoodIdeas(userId: string): Promise<UserGoodIdeas> {
    if (!isUuid(userId))
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Inicia sesión para consultar tus ideas aprobadas.",
      );
    return { ideas: await this.repository.listGoodIdeas(userId) };
  }

  async getUserProfile(userId: string): Promise<AccountProfile> {
    if (!isUuid(userId))
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Inicia sesión para consultar tu perfil.",
      );
    const profile = await this.repository.getProfileForUser(userId);
    if (!profile)
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    return profile;
  }

  async purchasePlanForUser(
    userId: string,
    value: unknown,
    idempotencyKey: unknown,
  ): Promise<AccountProfile> {
    if (value !== "ILUMINADO" && value !== "FALTON")
      throw new RegistrationError(
        400,
        "INVALID_PLAN",
        "Selecciona un plan válido.",
      );
    if (
      !isUuid(userId) ||
      typeof idempotencyKey !== "string" ||
      !isUuid(idempotencyKey)
    )
      throw new RegistrationError(
        400,
        "INVALID_PURCHASE",
        "No se ha podido identificar la contratación simulada.",
      );
    try {
      const profile = await this.repository.createSubscriptionPurchase(
        userId,
        value,
        idempotencyKey,
      );
      if (!profile)
        throw new RegistrationError(
          401,
          "SESSION_REQUIRED",
          "Tu sesión ha caducado. Inicia sesión para continuar.",
        );
      return profile;
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      if (error instanceof Error && error.message === "PLAN_ALREADY_ACTIVE") {
        throw new RegistrationError(
          409,
          "PLAN_ALREADY_ACTIVE",
          "Ese plan ya está activo. No hace falta pagar otro café todavía.",
        );
      }
      throw error;
    }
  }

  private async sessionResult(
    identity: SessionIdentity,
    accessToken: string,
    refreshToken: string,
  ): Promise<SessionIssue> {
    const account = await this.repository.getProfileForUser(identity.userId);
    if (!account)
      throw new RegistrationError(
        401,
        "SESSION_REQUIRED",
        "Tu sesión ha caducado. Inicia sesión para continuar.",
      );
    return {
      result: {
        status: "active",
        plan: identity.plan,
        account,
        accessToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
      refreshToken,
      rememberMe: identity.rememberMe,
      expiresAt: identity.expiresAt,
    };
  }
}

function validateRegistrationInput(value: unknown): RegistrationInput {
  if (!isRecord(value))
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Revisa los datos del formulario.",
    );
  const allowedFields = new Set([
    "email",
    "username",
    "password",
    "privacyPolicyAcknowledged",
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key)))
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Revisa los datos del formulario.",
    );
  const { email, username, password, privacyPolicyAcknowledged } = value;
  if (typeof email !== "string") {
    throw new RegistrationError(
      400,
      "INVALID_EMAIL",
      "Venga ya, ese correo no es de verdad, escribe bien anda.",
    );
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new RegistrationError(
      400,
      "INVALID_EMAIL",
      "Venga ya, ese correo no es de verdad, escribe bien anda.",
    );
  }
  if (
    typeof username !== "string" ||
    !USERNAME_PATTERN.test(username.trim().normalize("NFC")) ||
    username.trim().normalize("NFC").toLocaleLowerCase("es-ES") ===
      ADMIN_RESERVED_USERNAME
  ) {
    throw new RegistrationError(
      400,
      "INVALID_USERNAME",
      "Escribe un nombre de entre 3 y 30 caracteres alfanuméricos; los signos solo pueden ir en medio.",
    );
  }
  if (!isStrongPassword(password)) {
    throw new RegistrationError(
      400,
      "INVALID_PASSWORD",
      "La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y carácter especial.",
    );
  }
  if (privacyPolicyAcknowledged !== true) {
    throw new RegistrationError(
      400,
      "PRIVACY_POLICY_REQUIRED",
      "Debes leer y aceptar la política de privacidad para continuar.",
    );
  }
  return {
    email: normalizedEmail,
    username: username.trim().normalize("NFC"),
    password,
    privacyPolicyAcknowledged: true,
  };
}

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) return null;
  const separator = trimmed.lastIndexOf("@");
  const localPart = trimmed.slice(0, separator);
  const domain = domainToASCII(trimmed.slice(separator + 1));
  if (!domain || localPart.length > 64 || domain.length > 253) return null;
  const normalized = `${localPart}@${domain}`.toLowerCase();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
}

function loginUnavailable(): RegistrationError {
  return new RegistrationError(
    GENERIC_LOGIN_ERROR.status,
    GENERIC_LOGIN_ERROR.code,
    GENERIC_LOGIN_ERROR.message,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}
