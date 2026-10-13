import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";
import { RegistrationError, type PlanCode, type RegistrationInput, type RegistrationIntent, type RegistrationResult, type VerifiedResult, type SessionIssue, type SessionIdentity } from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";
import type { VerificationDelivery } from "./verification-delivery";

const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}
const INTENT_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;
const REGISTRATION_PENDING_MESSAGE = "Solicitud recibida. Completa la verificación para continuar con el alta.";
const GENERIC_CONFLICT = { status: 409, code: "REGISTRATION_UNAVAILABLE", message: "No se ha podido completar el alta con esos datos. Revisa la información e inténtalo de nuevo." } as const;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, saltHex, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(saltHex ?? "") || !/^[a-f0-9]{128}$/.test(expectedHex ?? "")) return false;
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

export class RegistrationService {
  constructor(
    private readonly repository: RegistrationRepository,
    private readonly delivery: VerificationDelivery,
  ) {}

  async createIntent(value: unknown): Promise<RegistrationIntent> {
    if (value !== "ILUMINADO" && value !== "FALTON") {
      throw new RegistrationError(400, "INVALID_PLAN", "Selecciona un plan válido.");
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

  async register(token: string | undefined, value: unknown): Promise<RegistrationResult> {
    const intentPlan = await this.currentIntent(token);
    if (!token || !intentPlan) throw new RegistrationError(400, "REGISTRATION_INTENT_REQUIRED", "Vuelve a elegir un plan para continuar.");
    const input = validateRegistrationInput(value);
    const passwordHash = await hashPassword(input.password);
    const verificationToken = newToken();
    try {
      const pending = await this.repository.consumeIntentAndRegister(
        hashToken(token), input, passwordHash, hashToken(verificationToken),
        new Date(Date.now() + VERIFICATION_TTL_MS),
      );
      await this.delivery.deliver(pending.email, verificationToken);
      return { status: "pending_email_verification", message: REGISTRATION_PENDING_MESSAGE, verificationExpiresAt: pending.verificationExpiresAt.toISOString() };
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      if (isUniqueViolation(error)) throw new RegistrationError(GENERIC_CONFLICT.status, GENERIC_CONFLICT.code, GENERIC_CONFLICT.message);
      throw new RegistrationError(503, "REGISTRATION_UNAVAILABLE", "No se ha podido completar el alta ahora.");
    }
  }

  async verify(token: string): Promise<{ result: VerifiedResult; confirmationToken: string }> {
    if (!isToken(token)) throw new RegistrationError(400, "INVALID_VERIFICATION", "El enlace no es válido o ha caducado.");
    const confirmationToken = newToken();
    try {
      const result = await this.repository.verify(hashToken(token), hashToken(confirmationToken));
      return { result, confirmationToken };
    } catch {
      throw new RegistrationError(400, "INVALID_VERIFICATION", "El enlace no es válido o ha caducado.");
    }
  }

  async confirm(token: string | undefined): Promise<SessionIssue> {
    if (!token || !isToken(token)) throw new RegistrationError(400, "VERIFICATION_REQUIRED", "Verifica tu correo antes de confirmar el plan.");
    let registration: { userId: string; username: string; plan: PlanCode };
    try {
      registration = await this.repository.confirm(hashToken(token));
    } catch {
      throw new RegistrationError(400, "VERIFICATION_REQUIRED", "Verifica tu correo antes de confirmar el plan.");
    }
    try {
      return await this.issueSession(registration);
    } catch {
      throw new RegistrationError(503, "SESSION_UNAVAILABLE", "La cuenta está activa, pero no se ha podido iniciar la sesión. Inténtalo de nuevo.");
    }
  }

  async refresh(token: string | undefined): Promise<SessionIssue> {
    if (!token || !isToken(token)) throw new RegistrationError(401, "SESSION_REQUIRED", "Tu sesión ha caducado. Inicia sesión para continuar.");
    const accessToken = newToken();
    const refreshToken = newToken();
    try {
      const identity = await this.repository.rotateSession(hashToken(token), hashToken(accessToken), hashToken(refreshToken), new Date(Date.now() + SESSION_TTL_MS));
      return this.sessionResult(identity, accessToken, refreshToken);
    } catch {
      throw new RegistrationError(401, "SESSION_REQUIRED", "Tu sesión ha caducado. Inicia sesión para continuar.");
    }
  }

  private async issueSession(registration: { userId: string; username: string; plan: PlanCode }): Promise<SessionIssue> {
    const accessToken = newToken();
    const refreshToken = newToken();
    await this.repository.createSession(registration.userId, hashToken(accessToken), hashToken(refreshToken), new Date(Date.now() + SESSION_TTL_MS));
    return this.sessionResult(registration, accessToken, refreshToken);
  }

  private sessionResult(identity: SessionIdentity, accessToken: string, refreshToken: string): SessionIssue {
    return { result: { status: "active", plan: identity.plan, accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }, refreshToken };
  }
}

function validateRegistrationInput(value: unknown): RegistrationInput {
  if (!isRecord(value)) throw new RegistrationError(400, "INVALID_REGISTRATION", "Revisa los datos del formulario.");
  const { email, username, password, privacyPolicyAcknowledged } = value;
  if (typeof email !== "string") {
    throw new RegistrationError(400, "INVALID_EMAIL", "Venga ya, ese correo no es de verdad, escribe bien anda.");
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new RegistrationError(400, "INVALID_EMAIL", "Venga ya, ese correo no es de verdad, escribe bien anda.");
  }
  if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim().normalize("NFC"))) {
    throw new RegistrationError(400, "INVALID_USERNAME", "Escribe un nombre de entre 3 y 30 caracteres alfanuméricos; los signos solo pueden ir en medio.");
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || hasControlCharacters(password)) {
    throw new RegistrationError(400, "INVALID_PASSWORD", "La contraseña debe tener entre 12 y 128 caracteres.");
  }
  if (privacyPolicyAcknowledged !== true) {
    throw new RegistrationError(400, "PRIVACY_POLICY_REQUIRED", "Debes leer y aceptar la política de privacidad para continuar.");
  }
  return { email: normalizedEmail, username: username.trim().normalize("NFC"), password, privacyPolicyAcknowledged: true };
}

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) return null;
  const separator = trimmed.lastIndexOf("@");
  const localPart = trimmed.slice(0, separator);
  const domain = domainToASCII(trimmed.slice(separator + 1));
  if (!domain || localPart.length > 64 || domain.length > 253) return null;
  const normalized = `${localPart}@${domain}`.toLowerCase();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) return true;
  }
  return false;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isToken(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}
