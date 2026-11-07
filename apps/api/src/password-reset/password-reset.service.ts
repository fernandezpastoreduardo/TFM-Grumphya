import { HttpException, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { normalizeEmailAddress } from "../infrastructure/validation/normalize-email-address";
import { isStrongPassword } from "../infrastructure/auth/password-policy";
import { hashPassword } from "../infrastructure/auth/password-hasher";
import type { MailService } from "../infrastructure/mail/mail.service";
import { renderGrumphyaEmail } from "../infrastructure/mail/grumphya-email";
import type { PasswordResetRepository } from "./password-reset.repository";

const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;
const PASSWORD_RESET_RESPONSE_FLOOR_MS = 450;
const PASSWORD_RESET_GENERIC_MESSAGE =
  "Si existe una cuenta activa con ese correo, recibirás instrucciones para cambiar la contraseña.";
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "La contraseña se ha actualizado. Inicia sesión con la nueva contraseña.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getWebOrigin(): string | null {
  const configured = process.env.WEB_ORIGIN;
  if (!configured) return null;
  try {
    const origin = new URL(configured);
    if (
      origin.origin !== configured.replace(/\/$/u, "") ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    ) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

async function waitForMinimumDuration(startedAt: number): Promise<void> {
  const remainingMs =
    PASSWORD_RESET_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
  }
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly mail: Pick<MailService, "send">,
  ) {}

  async request(value: unknown): Promise<{ message: string }> {
    const startedAt = Date.now();
    const email = readRequestEmail(value);
    if (email) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const target = await this.repository.replaceToken(
        email,
        tokenHash,
        new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      );
      if (target) {
        void this.deliver(target.email, token, target.userId, tokenHash).catch(
          () => {
            this.logger.error("Password reset email was not delivered", {
              errorCode: "MAIL_DELIVERY_FAILED",
            });
          },
        );
      }
    }
    await waitForMinimumDuration(startedAt);
    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
  }

  async complete(value: unknown): Promise<{ message: string }> {
    const request = readCompletionRequest(value);
    if (!request) throw new PasswordResetError(400, "INVALID_RESET_REQUEST");
    if (!isStrongPassword(request.password))
      throw new PasswordResetError(400, "INVALID_PASSWORD");
    const consumed = await this.repository.consumeToken(
      hashToken(request.token),
      await hashPassword(request.password),
    );
    if (!consumed) throw new PasswordResetError(400, "INVALID_RESET_LINK");
    return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
  }

  private async deliver(
    email: string,
    token: string,
    userId: string,
    tokenHash: string,
  ): Promise<void> {
    const origin = getWebOrigin();
    if (!origin) {
      this.logger.error("Password reset email was not delivered", {
        errorCode: "INVALID_WEB_ORIGIN",
      });
      await this.repository.invalidateToken(userId, tokenHash);
      return;
    }
    const url = `${origin}/restablecer-contrasena#${token}`;
    const emailContent = renderGrumphyaEmail({
      title: "Cambia tu contraseña",
      preheader: "Enlace de un solo uso válido durante 20 minutos.",
      paragraphs: [
        "Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.",
        "Si no la has pedido, puedes ignorar este correo. El enlace dejará de funcionar en 20 minutos.",
      ],
      action: { label: "Elegir nueva contraseña", url },
    });
    try {
      await this.mail.send({
        to: email,
        subject: "Cambia tu contraseña de Grumphya",
        ...emailContent,
      });
    } catch {
      this.logger.error("Password reset email was not delivered", {
        errorCode: "MAIL_DELIVERY_FAILED",
      });
      await this.repository.invalidateToken(userId, tokenHash);
    }
  }
}

export class PasswordResetError extends HttpException {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(
      {
        statusCode,
        code,
        message:
          code === "INVALID_PASSWORD"
            ? "La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y carácter especial."
            : "El enlace no es válido o ha caducado.",
      },
      statusCode,
    );
  }
}

function readRequestEmail(value: unknown): string | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "email"))
    return null;
  return typeof value.email === "string"
    ? normalizeEmailAddress(value.email)
    : null;
}

function readCompletionRequest(
  value: unknown,
): { token: string; password: string } | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "token" && key !== "password") ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.token) ||
    typeof value.password !== "string"
  ) {
    return null;
  }
  return { token: value.token, password: value.password };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
