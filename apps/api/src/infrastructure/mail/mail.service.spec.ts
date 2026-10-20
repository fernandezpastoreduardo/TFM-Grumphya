import { afterEach, describe, expect, it } from "vitest";
import { MailService } from "./mail.service";

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
});

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
});
