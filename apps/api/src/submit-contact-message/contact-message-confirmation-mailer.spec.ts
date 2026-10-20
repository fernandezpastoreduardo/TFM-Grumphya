import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailService } from "../infrastructure/mail/mail.service";
import { ContactMessageConfirmationMailer } from "./contact-message-confirmation-mailer";

const RECIPIENT = "persona@example.es";
const REPLY_TO = "contacto@grumphya.example";
const MESSAGE_REFERENCE = "20000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-10-20T10:00:00.000Z";

describe("ContactMessageConfirmationMailer", () => {
  afterEach(() => {
    delete process.env.MAIL_FROM_ADDRESS;
  });

  it("sends a Grumphya HTML and text confirmation without private message content", async () => {
    process.env.MAIL_FROM_ADDRESS = REPLY_TO;
    const send = vi.fn().mockResolvedValue("sent");
    const mailer = new ContactMessageConfirmationMailer({
      send,
    } as unknown as MailService);

    await mailer.sendConfirmation({
      recipient: RECIPIENT,
      subject: "Hemos recibido correctamente tu mensaje",
      createdAt: CREATED_AT,
      reference: MESSAGE_REFERENCE,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: RECIPIENT,
        replyTo: REPLY_TO,
        subject: "Hemos recibido correctamente tu mensaje",
        html: expect.stringContaining("GRUMPHYA"),
        text: expect.stringContaining(MESSAGE_REFERENCE),
      }),
    );
    const email = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(email.html).toContain(MESSAGE_REFERENCE);
    expect(email.html).toContain("2026");
    expect(email.text).toContain("2026");
    expect(email.text).not.toContain("texto privado");
    expect(email.html).not.toContain("texto privado");
  });
});
