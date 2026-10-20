import { describe, expect, it, vi } from "vitest";
import {
  ContactMessageError,
  type ContactMessageRepository,
} from "./submit-contact-message.models";
import { SubmitContactMessage } from "./submit-contact-message.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_KEY = "10000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";
const VALID_SUBJECT = "Consulta";
const VALID_MESSAGE = "Mensaje suficientemente largo";
const CREATED_AT = "2026-10-20T10:00:00.000Z";

function createRepository(): ContactMessageRepository {
  return {
    createForUser: vi.fn().mockResolvedValue({
      id: MESSAGE_ID,
      createdAt: CREATED_AT,
      recipient: "persona@example.es",
      subject: VALID_SUBJECT,
      status: "pending",
      canRetry: true,
    }),
    getForUser: vi.fn().mockResolvedValue({
      id: MESSAGE_ID,
      createdAt: CREATED_AT,
      recipient: "persona@example.es",
      subject: VALID_SUBJECT,
      status: "failed",
      canRetry: true,
    }),
    claimConfirmation: vi.fn().mockResolvedValue("claimed"),
    markConfirmationSent: vi.fn().mockResolvedValue(undefined),
    markConfirmationPreviewed: vi.fn().mockResolvedValue(undefined),
    markConfirmationFailed: vi.fn().mockResolvedValue(true),
  };
}

describe("SubmitContactMessage", () => {
  it("stores first, derives the recipient from persistence, and sends a minimal confirmation", async () => {
    const repository = createRepository();
    const mailer = { sendConfirmation: vi.fn().mockResolvedValue("sent") };
    const feature = new SubmitContactMessage(repository, mailer);

    const result = await feature.execute(USER_ID, REQUEST_KEY, {
      subject: "  Consulta de mi cuenta  ",
      message: "  Necesito ayuda con el estado de mi plan.  ",
    });

    expect(repository.createForUser).toHaveBeenCalledWith(
      USER_ID,
      REQUEST_KEY,
      "Consulta de mi cuenta",
      "Necesito ayuda con el estado de mi plan.",
    );
    expect(repository.claimConfirmation).toHaveBeenCalledWith(
      USER_ID,
      MESSAGE_ID,
    );
    expect(mailer.sendConfirmation).toHaveBeenCalledWith({
      recipient: "persona@example.es",
      subject: "Hemos recibido correctamente tu mensaje",
      createdAt: CREATED_AT,
      reference: MESSAGE_ID,
    });
    expect(result.status).toBe("sent");
  });

  it("keeps the saved message and exposes a retry when SMTP fails", async () => {
    const repository = createRepository();
    const mailer = {
      sendConfirmation: vi
        .fn()
        .mockRejectedValue(new Error("private SMTP detail")),
    };
    const feature = new SubmitContactMessage(repository, mailer);

    const result = await feature.execute(USER_ID, REQUEST_KEY, {
      subject: VALID_SUBJECT,
      message: VALID_MESSAGE,
    });

    expect(result.status).toBe("failed");
    expect(repository.createForUser).toHaveBeenCalledTimes(1);
    expect(repository.markConfirmationFailed).toHaveBeenCalledWith(MESSAGE_ID);
    expect(repository.markConfirmationSent).not.toHaveBeenCalled();
  });

  it("records local preview without claiming that an email was sent", async () => {
    const repository = createRepository();
    const mailer = {
      sendConfirmation: vi.fn().mockResolvedValue("previewed"),
    };
    const feature = new SubmitContactMessage(repository, mailer);

    await expect(
      feature.execute(USER_ID, REQUEST_KEY, {
        subject: VALID_SUBJECT,
        message: VALID_MESSAGE,
      }),
    ).resolves.toMatchObject({ status: "previewed" });

    expect(repository.markConfirmationPreviewed).toHaveBeenCalledWith(
      MESSAGE_ID,
    );
    expect(repository.markConfirmationSent).not.toHaveBeenCalled();
  });

  it("retries only confirmation for the saved message, never creating another contact row", async () => {
    const repository = createRepository();
    const mailer = { sendConfirmation: vi.fn().mockResolvedValue("sent") };
    const feature = new SubmitContactMessage(repository, mailer);

    await expect(
      feature.retryConfirmation(USER_ID, MESSAGE_ID),
    ).resolves.toMatchObject({
      id: MESSAGE_ID,
      status: "sent",
    });

    expect(repository.createForUser).not.toHaveBeenCalled();
    expect(repository.claimConfirmation).toHaveBeenCalledWith(
      USER_ID,
      MESSAGE_ID,
    );
    expect(mailer.sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("does not retry a confirmation already being sent or already delivered", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimConfirmation).mockResolvedValue("already_sent");
    const mailer = { sendConfirmation: vi.fn() };
    const feature = new SubmitContactMessage(repository, mailer);

    await feature.retryConfirmation(USER_ID, MESSAGE_ID);

    expect(mailer.sendConfirmation).not.toHaveBeenCalled();
    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { subject: "x", message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "corto" },
    { subject: "x".repeat(121), message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "m".repeat(4001) },
    {
      subject: VALID_SUBJECT,
      message: VALID_MESSAGE,
      email: "spoof@example.com",
    },
    { subject: "   ", message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "          " },
    { subject: 123, message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: ["mensaje", "en partes"] },
    [],
    "mensaje",
  ])("rejects invalid or unexpected contact data", async (payload) => {
    const repository = createRepository();
    const feature = new SubmitContactMessage(repository, {
      sendConfirmation: vi.fn(),
    });

    await expect(
      feature.execute(USER_ID, REQUEST_KEY, payload),
    ).rejects.toMatchObject({
      code: "INVALID_CONTACT_MESSAGE",
    });
    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  it("accepts the exact minimum and maximum field lengths", async () => {
    const repository = createRepository();
    const feature = new SubmitContactMessage(repository, {
      sendConfirmation: vi.fn().mockResolvedValue("sent"),
    });

    await feature.execute(USER_ID, REQUEST_KEY, {
      subject: "abc",
      message: "1234567890",
    });
    await feature.execute(USER_ID, "10000000-0000-4000-8000-000000000002", {
      subject: "s".repeat(120),
      message: "m".repeat(4000),
    });

    expect(repository.createForUser).toHaveBeenNthCalledWith(
      1,
      USER_ID,
      REQUEST_KEY,
      "abc",
      "1234567890",
    );
    expect(repository.createForUser).toHaveBeenNthCalledWith(
      2,
      USER_ID,
      "10000000-0000-4000-8000-000000000002",
      "s".repeat(120),
      "m".repeat(4000),
    );
  });

  it("does not accept an invalid authenticated user identifier", async () => {
    const feature = new SubmitContactMessage(createRepository(), {
      sendConfirmation: vi.fn(),
    });

    await expect(
      feature.execute("not-a-user", REQUEST_KEY, {
        subject: "Consulta",
        message: "Mensaje suficientemente largo",
      }),
    ).rejects.toBeInstanceOf(ContactMessageError);
  });

  it("rejects a missing idempotency key before writing", async () => {
    const repository = createRepository();
    const feature = new SubmitContactMessage(repository, {
      sendConfirmation: vi.fn(),
    });

    await expect(
      feature.execute(USER_ID, undefined, {
        subject: VALID_SUBJECT,
        message: VALID_MESSAGE,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTACT_REQUEST_KEY" });
    expect(repository.createForUser).not.toHaveBeenCalled();
  });
});
