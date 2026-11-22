import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { SmtpMailTransportMock, smtpSend } = vi.hoisted(() => ({
  SmtpMailTransportMock: vi.fn(),
  smtpSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./smtp-mail.transport", () => ({
  SmtpMailTransport: SmtpMailTransportMock.mockImplementation(function (this: {
    send: typeof smtpSend;
  }) {
    this.send = smtpSend;
  }),
}));

import { MailService } from "./mail.service";
import {
  readBackendProcessorRegistry,
  resetBackendProcessorRegistryForTests,
} from "../observability/backend-processors-registry";

const REQUIRED_ENV = [
  "NODE_ENV",
  "MAIL_SMTP_HOST",
  "MAIL_SMTP_PORT",
  "MAIL_USERNAME",
  "MAIL_PASSWORD",
  "MAIL_FROM_ADDRESS",
] as const;
const originalEnvironment = new Map<string, string | undefined>(
  REQUIRED_ENV.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of REQUIRED_ENV) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetBackendProcessorRegistryForTests();
});

beforeEach(() => {
  vi.clearAllMocks();
  smtpSend.mockResolvedValue(undefined);
  resetBackendProcessorRegistryForTests();
});

function configureProductionMail(
  port = "587",
  fromAddress = "mail@example.test",
) {
  process.env.NODE_ENV = "production";
  process.env.MAIL_SMTP_HOST = "smtp.example.test";
  process.env.MAIL_SMTP_PORT = port;
  process.env.MAIL_USERNAME = "mailer";
  process.env.MAIL_PASSWORD = "test-only-password";
  process.env.MAIL_FROM_ADDRESS = fromAddress;
}

const VALID_MESSAGE = {
  to: "person@example.test",
  subject: "Verifica tu cuenta",
  text: "Enlace de verificación",
  html: "<p>Enlace de verificación</p>",
};

describe("MailService", () => {
  it("keeps a local preview without making a network delivery", async () => {
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_USERNAME;
    delete process.env.MAIL_PASSWORD;
    delete process.env.MAIL_FROM_ADDRESS;
    process.env.NODE_ENV = "development";
    const mail = new MailService();
    await expect(
      mail.send({
        to: "person@example.test",
        subject: "Verifica tu cuenta",
        text: "Enlace local",
        html: "<p>Enlace local</p>",
      }),
    ).resolves.toBe("previewed");

    expect(mail.getLatestLocalPreview()).toMatchObject({
      to: "person@example.test",
      subject: "Verifica tu cuenta",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
    });
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("replaces the latest local preview with the newest message", async () => {
    process.env.NODE_ENV = "test";
    const mail = new MailService();
    await mail.send(VALID_MESSAGE);
    await mail.send({ ...VALID_MESSAGE, subject: "Nueva notificación" });

    expect(mail.getLatestLocalPreview()).toMatchObject({
      subject: "Nueva notificación",
      text: VALID_MESSAGE.text,
    });
  });

  it("fails startup in production when required SMTP settings are missing", () => {
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_USERNAME;
    delete process.env.MAIL_PASSWORD;
    delete process.env.MAIL_FROM_ADDRESS;
    process.env.NODE_ENV = "production";

    expect(() => new MailService()).toThrow(
      /Production mail configuration is incomplete/,
    );
  });

  it.each(["0", "65536", "1.5", "not-a-port"])(
    "rejects invalid production SMTP port %s",
    (port) => {
      configureProductionMail(port);

      expect(() => new MailService()).toThrow(
        "MAIL_SMTP_PORT must be a valid TCP port.",
      );
      expect(SmtpMailTransportMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid production sender address", () => {
    configureProductionMail("587", "invalid sender");

    expect(() => new MailService()).toThrow(
      "Mail address configuration is invalid.",
    );
  });

  it("delivers a valid production message through the SMTP transport", async () => {
    configureProductionMail();
    const mail = new MailService();

    await expect(mail.send(VALID_MESSAGE)).resolves.toBe("sent");

    expect(SmtpMailTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 587,
      username: "mailer",
      password: "test-only-password",
      fromAddress: "mail@example.test",
    });
    expect(smtpSend).toHaveBeenCalledWith(VALID_MESSAGE);
  });

  it("registers the configured SMTP adapter without exposing its host", () => {
    configureProductionMail();
    new MailService();

    const registration = readBackendProcessorRegistry().registrations.find(
      ({ registrationId }) => registrationId === "smtp-mail",
    );
    expect(registration?.processor).toEqual({
      providerId: "smtp-unidentified",
      displayName: "Proveedor SMTP no identificado",
      product: "SMTP",
    });
    expect(JSON.stringify(registration)).not.toContain("smtp.example.test");
  });

  it("propagates SMTP delivery failures without storing a local preview", async () => {
    configureProductionMail();
    smtpSend.mockRejectedValue(new Error("SMTP connection failed"));
    const mail = new MailService();

    await expect(mail.send(VALID_MESSAGE)).rejects.toThrow(
      "SMTP connection failed",
    );

    expect(mail.getLatestLocalPreview()).toBeUndefined();
    expect(smtpSend).toHaveBeenCalledWith(VALID_MESSAGE);
  });

  it("does not expose a local preview in production", async () => {
    process.env.NODE_ENV = "development";
    const mail = new MailService();
    await mail.send(VALID_MESSAGE);
    process.env.NODE_ENV = "production";

    expect(mail.getLatestLocalPreview()).toBeUndefined();
  });

  it("rejects malformed recipients before transport", async () => {
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_USERNAME;
    delete process.env.MAIL_PASSWORD;
    delete process.env.MAIL_FROM_ADDRESS;
    process.env.NODE_ENV = "development";
    const mail = new MailService();

    await expect(
      mail.send({
        to: "recipient\\r\\nBcc: attacker@example.test",
        subject: "Test",
        text: "Text",
        html: "<p>Text</p>",
      }),
    ).rejects.toThrow(/Mail address configuration is invalid/);
  });

  it.each([
    [
      "blank subject",
      { ...VALID_MESSAGE, subject: "   " },
      "Invalid outgoing email.",
    ],
    [
      "subject line injection",
      { ...VALID_MESSAGE, subject: "Hello\nBcc: a@b.test" },
      "Invalid outgoing email.",
    ],
    [
      "reply-to injection",
      { ...VALID_MESSAGE, replyTo: "bad address" },
      "Mail address configuration is invalid.",
    ],
    [
      "non-text body",
      { ...VALID_MESSAGE, text: null },
      "Invalid outgoing email.",
    ],
    [
      "non-HTML body",
      { ...VALID_MESSAGE, html: 42 },
      "Invalid outgoing email.",
    ],
  ])(
    "rejects a message with %s before transport",
    async (_case, message, expectedError) => {
      process.env.NODE_ENV = "development";
      const mail = new MailService();

      await expect(Reflect.apply(mail.send, mail, [message])).rejects.toThrow(
        expectedError,
      );
      expect(smtpSend).not.toHaveBeenCalled();
    },
  );
});
